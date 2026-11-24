import base64
import json
import os
import re
import signal
import subprocess
import sys
import time

request = json.loads(sys.argv[1])
run_id = request.get('runId', '')
if not re.fullmatch(r'[0-9a-f-]{36}', run_id):
    raise ValueError('Invalid run identifier')
root = os.path.join(os.path.expanduser('~'), '.archimedes', 'managed-runs')
folder = os.path.join(root, run_id)
state_file = os.path.join(folder, 'state.json')
log_file = os.path.join(folder, 'run.log')

def identity(pid):
    try:
        with open('/proc/sys/kernel/random/boot_id') as f:
            boot = f.read().strip()
        with open('/proc/%d/stat' % pid) as f:
            stat = f.read()
        return [boot, stat[stat.rfind(')') + 2:].split()[19]]
    except (OSError, IndexError):
        return None

def state(value):
    temp = state_file + '.tmp'
    with open(temp, 'w') as f:
        json.dump(value, f)
    os.replace(temp, state_file)

def inspect():
    try:
        with open(state_file) as f:
            result = json.load(f)
    except (OSError, ValueError):
        return {'status': 'unknown', 'reason': 'Remote job state is unavailable.'}
    if result.get('status') == 'starting' and time.time() - os.path.getmtime(state_file) > 15:
        return {'status': 'unknown', 'reason': 'The remote supervisor did not report a running state.'}
    if result.get('status') == 'running':
        pid, token = result.get('pid'), result.get('identity')
        if not isinstance(pid, int) or pid < 2 or not isinstance(token, list) or identity(pid) != token:
            return {'status': 'unknown', 'reason': 'The remote supervisor cannot be verified.'}
    return result

op = request.get('op')
if op == 'launch':
    cwd = os.path.expanduser(request['cwd'])
    if not os.path.isdir(cwd):
        raise ValueError('Remote working directory does not exist')
    os.makedirs(root, mode=0o700, exist_ok=True)
    os.mkdir(folder, 0o700)  # A repeated request must never start a second process.
    with open(os.path.join(folder, 'spec.json'), 'x') as f:
        json.dump({'command': request['command'], 'cwd': cwd}, f)
    state({'status': 'starting'})
    with open(os.devnull, 'rb') as devnull, open(log_file, 'ab') as log:
        subprocess.Popen([sys.executable, '-c', sys.argv[2], json.dumps({'op': 'worker', 'runId': run_id}), sys.argv[2]],
                         stdin=devnull, stdout=log, stderr=subprocess.STDOUT, start_new_session=True, close_fds=True)
    print(json.dumps({'status': 'starting'}))
elif op == 'worker':
    child = None
    cancelled = False
    def stop(_signal, _frame):
        global cancelled
        cancelled = True
        if child is not None and child.poll() is None:
            os.killpg(child.pid, signal.SIGTERM)
    signal.signal(signal.SIGTERM, stop)
    try:
        token = identity(os.getpid())
        if token is None:
            raise RuntimeError('Linux process identity is unavailable')
        with open(os.path.join(folder, 'spec.json')) as f:
            spec = json.load(f)
        child = subprocess.Popen(['bash', '-lc', spec['command']], cwd=spec['cwd'], start_new_session=True)
        state({'status': 'running', 'pid': os.getpid(), 'identity': token})
        while child.poll() is None:
            if cancelled:
                try:
                    child.wait(timeout=2)
                except subprocess.TimeoutExpired:
                    os.killpg(child.pid, signal.SIGKILL)
                break
            time.sleep(.2)
        code = child.wait()
        state({'status': 'cancelled' if cancelled else 'succeeded' if code == 0 else 'failed', 'exitCode': code})
    except BaseException as error:
        state({'status': 'failed', 'exitCode': None, 'error': str(error)[:1000]})
elif op == 'inspect':
    result = inspect()
    try:
        size = os.path.getsize(log_file)
        limit = max(1000, min(120000, int(request.get('maxBytes', 12000))))
        with open(log_file, 'rb') as f:
            f.seek(max(0, size - limit))
            content = f.read(limit)
        result.update({'size': size, 'log': base64.b64encode(content).decode('ascii')})
    except OSError:
        result.update({'size': 0, 'log': ''})
    print(json.dumps(result))
elif op == 'cancel':
    result = inspect()
    if result.get('status') != 'running':
        raise RuntimeError('Remote job is not confirmed running; cancellation was not sent')
    os.kill(result['pid'], signal.SIGTERM)
    print(json.dumps({'status': 'cancellation_requested'}))
else:
    raise ValueError('Invalid operation')
