'use strict';

const path = require('path');
const fs = require('fs');
const os = require('os');
const request = require('supertest');

let app;

beforeAll(() => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sde-'));
  process.env.NODE_ENV = 'test';
  process.env.DATA_DIR = tmp;
  process.env.MASTER_KEY = process.env.MASTER_KEY || 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=';
  process.env.ALLOWED_ORIGIN = '';
  // Re-require app fresh with these env values
  delete require.cache[require.resolve('../server')];
  delete require.cache[require.resolve('../database')];
  delete require.cache[require.resolve('../lib/config')];
  app = require('../server');
});

describe('auth integration', () => {
  it('register → me → logout flow', async () => {
    const email = `u${Date.now()}@example.com`;
    const reg = await request(app)
      .post('/api/auth/register')
      .send({ fullName: 'Test User', email, password: 'supersecret', mobile: '9876543210' });
    expect(reg.status).toBe(200);
    expect(reg.body.token).toBeDefined();

    const me = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${reg.body.token}`);
    expect(me.status).toBe(200);
    expect(me.body.user.email).toBe(email);

    const out = await request(app).post('/api/auth/logout').set('Authorization', `Bearer ${reg.body.token}`);
    expect(out.status).toBe(200);

    const me2 = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${reg.body.token}`);
    expect(me2.status).toBe(401);
  });

  it('rejects unauthenticated requests to protected routes', async () => {
    const r = await request(app).get('/api/history');
    expect(r.status).toBe(401);
  });

  it('SSRF guard rejects metadata IP via /api/check-url', async () => {
    const email = `u${Date.now()}b@example.com`;
    const reg = await request(app)
      .post('/api/auth/register')
      .send({ fullName: 'B', email, password: 'supersecret', mobile: '9876500000' });
    const r = await request(app)
      .get('/api/check-url')
      .set('Authorization', `Bearer ${reg.body.token}`)
      .query({ url: 'http://169.254.169.254/latest/meta-data/' });
    expect(r.status).toBe(400);
  });
});
