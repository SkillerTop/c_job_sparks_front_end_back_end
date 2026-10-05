import childProcess from 'node:child_process';
import { EventEmitter } from 'node:events';
import { syncBuiltinESMExports } from 'node:module';

childProcess.exec = (_command, ...args) => {
  const callback = args.findLast((value) => typeof value === 'function');
  queueMicrotask(() => callback?.(null, '', ''));
  return new EventEmitter();
};

syncBuiltinESMExports();
