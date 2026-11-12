"""One-time configuration after migrations 002/003. Never prints credentials.

Uses the already-authenticated Supabase CLI. Migration 004 removes the temporary
service-role-only credential bridge after deployment succeeds.
"""
import json
import os
from pathlib import Path
import subprocess
import tempfile
import urllib.request

PROJECT = 'silaakpxbykwoguiajdb'
BASE = 'https://' + PROJECT + '.supabase.co'


def cli(*args):
    result = subprocess.run(['supabase', *args], capture_output=True, text=True, check=False)
    if result.returncode:
        # CLI error output may contain environment values; do not echo it.
        raise RuntimeError('Supabase command failed: ' + args[0])
    return result.stdout


def request(path, headers, data=None):
    req = urllib.request.Request(BASE + path, headers=headers,
                                 data=None if data is None else json.dumps(data).encode())
    with urllib.request.urlopen(req, timeout=60) as response:
        body = response.read().decode()
        return json.loads(body) if body else None


def main():
    keys = json.loads(cli('projects', 'api-keys', '--project-ref', PROJECT, '--output', 'json'))
    service = next((r.get('api_key') for r in keys if r.get('name') == 'service_role'), None)
    if not service:
        raise RuntimeError('Server credential unavailable; no configuration changed.')
    secret = request('/rest/v1/rpc/aurum_auto_bootstrap_secret',
                     {'apikey': service, 'Authorization': 'Bearer ' + service,
                      'Content-Type': 'application/json'}, {})
    if not isinstance(secret, str) or len(secret) < 32 or not secret.isalnum():
        raise RuntimeError('Invalid worker credential; no configuration changed.')
    # 0600 temporary file, removed even on deployment failure. Never part of app bundle.
    fd, name = tempfile.mkstemp(prefix='aurum-worker-', suffix='.env')
    try:
        with os.fdopen(fd, 'w') as file:
            file.write('AURUM_CRON_SECRET=' + secret + '\n')
        cli('secrets', 'set', '--project-ref', PROJECT, '--env-file', name)
    finally:
        Path(name).unlink(missing_ok=True)
    print('Worker secret configured; no credential written to repository.')
    cli('functions', 'deploy', 'auto-reports', '--project-ref', PROJECT, '--use-api')
    print('Backend function deployed to the intended project. No Android build.')
    result = request('/functions/v1/auto-reports', {'x-aurum-secret': secret, 'Content-Type': 'application/json'}, {})
    print('Worker verification:', json.dumps(result))


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        print('Setup not complete:', type(error).__name__, str(error))
        raise SystemExit(1) from None
