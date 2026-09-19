import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { AsyncLocalStorage } from 'node:async_hooks';

export const usageContext = new AsyncLocalStorage();
export function reportUsage(usage) {
  const current = usageContext.getStore();
  if (!current) return;
  current.calls++;
  if (!usage || !Number.isFinite(usage.input_tokens) || !Number.isFinite(usage.output_tokens)) { current.unreportedCalls++; return; }
  current.inputTokens += usage.input_tokens;
  current.outputTokens += usage.output_tokens;
  current.cachedTokens += usage.input_tokens_details?.cached_tokens || 0;
}
export function newUsage() { return {calls:0, inputTokens:0, outputTokens:0, cachedTokens:0, unreportedCalls:0}; }

// One library and one Node process per deployment. Use a durable volume in production.
export class MetricsStore {
  constructor({file, libraryId='biblioteca', libraryName='Biblioteca', limit=null}) {
    if (limit !== null && (!Number.isSafeInteger(limit) || limit < 0)) throw new Error('LIBRARY_RECORD_LIMIT debe ser un entero no negativo.');
    this.file = file; this.libraryId = libraryId; this.libraryName = libraryName; this.limit = limit;
    this.pending = new Set();
    this.state = {libraryId, startedAt:new Date().toISOString(), completed:0, failed:0, byType:{}, ...newUsage(), recent:[]};
    if (fs.existsSync(file)) {
      this.state = JSON.parse(fs.readFileSync(file,'utf8'));
      if (this.state.libraryId !== libraryId || !Number.isSafeInteger(this.state.completed) || !Array.isArray(this.state.recent)) throw new Error('El archivo de métricas no corresponde a esta biblioteca o es inválido.');
    }
    // Older files only retained usage by request in the last 100 entries.
    // Recover that known subset without presenting it as full historical usage.
    if (!this.state.bookUsage) {
      const books = this.state.recent.filter(r => r.format === 'book' && r.status === 'completed');
      this.state.bookUsage = books.reduce((sum, r) => ({
        count:sum.count+1, inputTokens:sum.inputTokens+r.inputTokens,
        outputTokens:sum.outputTokens+r.outputTokens,
        unreportedCalls:sum.unreportedCalls+(r.unreportedCalls || 0)
      }), {count:0,inputTokens:0,outputTokens:0,unreportedCalls:0});
    }
  }
  save() {
    fs.mkdirSync(path.dirname(this.file), {recursive:true});
    fs.writeFileSync(this.file+'.tmp', JSON.stringify(this.state), {mode:0o600});
    fs.renameSync(this.file+'.tmp', this.file);
  }
  reserve() {
    if (this.limit !== null && this.state.completed + this.pending.size >= this.limit) {
      const error = new Error('Se alcanzó la cuota de registros de esta biblioteca.'); error.status = 429; throw error;
    }
    this.save(); // Check storage before spending tokens.
    const id = randomUUID(); this.pending.add(id); return id;
  }
  finish(id, {success, format, usage, title}) {
    if (!this.pending.has(id)) return;
    const before = structuredClone(this.state);
    if (success) { this.state.completed++; this.state.byType[format] = (this.state.byType[format] || 0)+1; }
    else this.state.failed++;
    if (success && format === 'book') {
      this.state.bookUsage.count++;
      this.state.bookUsage.inputTokens += usage.inputTokens;
      this.state.bookUsage.outputTokens += usage.outputTokens;
      this.state.bookUsage.unreportedCalls += usage.unreportedCalls;
    }
    for (const key of Object.keys(newUsage())) this.state[key] += usage[key];
    this.state.recent.unshift({id, title: typeof title === 'string' ? title.slice(0,500) : '', date:new Date().toISOString(), format, status:success ? 'completed':'failed', ...usage});
    this.state.recent = this.state.recent.slice(0,100);
    try { this.save(); this.pending.delete(id); }
    catch (error) { this.state = before; throw error; }
  }
  snapshot() {
    const books = this.state.bookUsage;
    const bookTotal = books.inputTokens+books.outputTokens;
    return {...this.state,
      bookTokens:bookTotal,
      averageTokensPerBook:books.count ? Math.round(bookTotal/books.count) : null,
      bookUsageComplete:books.count === (this.state.byType.book || 0) && books.unreportedCalls === 0,
      libraryName:this.libraryName, limit:this.limit, inProgress:this.pending.size,
      remaining:this.limit === null ? null : Math.max(0,this.limit-this.state.completed-this.pending.size),
      totalTokens:this.state.inputTokens+this.state.outputTokens};
  }
}
