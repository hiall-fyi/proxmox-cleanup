import { Reporter } from '../Reporter';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

describe('Reporter verbose', () => {
  let dir: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'reporter-verbose-'));
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  async function logLine(verbose: boolean): Promise<string> {
    const reporter = new Reporter(dir, true, 30, verbose);
    reporter.logDebug('Protected image: keep-img', { resourceId: 'i1' });
    const logger = reporter.getLogger();
    await new Promise<void>(resolve => {
      logger.on('finish', () => resolve());
      logger.end();
    });
    const file = path.join(dir, 'cleanup.log');
    return fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
  }

  it('writes debug lines to the log when verbose is true', async () => {
    const content = await logLine(true);
    expect(content).toContain('Protected image: keep-img');
    expect(content).toContain('"level":"debug"');
  });

  it('drops debug lines when verbose is false', async () => {
    expect(await logLine(false)).not.toContain('Protected image: keep-img');
  });

  it('sets the logger level from verbose', () => {
    expect(new Reporter(dir, true, 30, true).getLogger().level).toBe('debug');
    expect(new Reporter(dir, true, 30, false).getLogger().level).toBe('info');
  });
});
