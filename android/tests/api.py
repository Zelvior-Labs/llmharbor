"""Shared smoke against a real packaged gateway. Never prints a credential or code."""
import http.server
import json
import threading
import urllib.error
import urllib.request


class Upstream(http.server.BaseHTTPRequestHandler):
    def log_message(self, *_):
        pass

    def do_GET(self):
        self.reply(200, {"object": "list", "data": [{"id": "phone-test", "object": "model"}]})

    def do_POST(self):
        payload = json.loads(self.rfile.read(int(self.headers['Content-Length'])))
        if self.headers.get('Authorization') != 'Bearer test-provider-key' or payload.get('model') != 'phone-test':
            return self.reply(401, {"error": "wrong provider credential or model"})
        self.reply(200, {"id": "chatcmpl-phone", "object": "chat.completion", "model": "phone-test", "created": 1,
                         "choices": [{"index": 0, "message": {"role": "assistant", "content": "routed-ok"}, "finish_reason": "stop"}],
                         "usage": {"prompt_tokens": 2, "completion_tokens": 1, "total_tokens": 3}})

    def reply(self, status, body):
        data = json.dumps(body).encode()
        self.send_response(status)
        self.send_header('Content-Type', 'application/json'); self.send_header('Content-Length', str(len(data)))
        self.end_headers(); self.wfile.write(data)


def upstream():
    relay = http.server.ThreadingHTTPServer(('127.0.0.1', 0), Upstream)
    threading.Thread(target=relay.serve_forever, daemon=True).start()
    return relay.server_port


class Smoke:
    def __init__(self, port):
        self.base = f'http://127.0.0.1:{port}'

    def req(self, path, body=None, token=None, status=200):
        headers = {'Content-Type': 'application/json'}
        if token: headers['Authorization'] = f'Bearer {token}'
        request = urllib.request.Request(self.base + path, data=None if body is None else json.dumps(body).encode(), headers=headers)
        try:
            response = urllib.request.urlopen(request, timeout=35)
        except urllib.error.HTTPError as err:
            response = err
        with response:
            assert response.status == status, f'{path}: expected {status}, got {response.status}'
            return json.load(response)

    def setup(self, code, provider_port):
        with urllib.request.urlopen(self.base + '/', timeout=10) as page:
            assert 'LLMHarbor' in page.read().decode()
        assert self.req('/api/auth/status')['needsSetup']
        credentials = {'email': 'phone@example.test', 'password': 'smoke-account-only'}
        assert self.req('/api/auth/setup', credentials, status=403)['error']['type'] == 'setup_code_required'
        self.req('/api/keys', status=401); self.req('/v1/models', status=401)
        session = self.req('/api/auth/setup', {**credentials, 'setupCode': code}, status=201)['token']
        key = self.req('/api/settings/api-key', token=session)['apiKey']
        self.req('/api/keys/custom', {'baseUrl': f'http://127.0.0.1:{provider_port}/v1', 'model': 'phone-test',
                                      'apiKey': 'test-provider-key', 'label': 'Android smoke'}, session, 201)
        self.chat(key)
        return key

    def chat(self, key):
        assert any(m['id'] == 'phone-test' for m in self.req('/v1/models', token=key)['data'])
        answer = self.req('/v1/chat/completions', {'model': 'phone-test', 'messages': [{'role': 'user', 'content': 'hello'}]}, key)
        assert answer['choices'][0]['message']['content'] == 'routed-ok'
