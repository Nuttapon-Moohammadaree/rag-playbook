/**
 * Health check route
 */

import { Hono } from 'hono';

const health = new Hono();

health.get('/', (c) => {
  return c.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    services: {
      api: 'up',
      // Will be populated when core services are connected
    },
  });
});

health.get('/ready', async (c) => {
  // Check if all dependencies are ready
  const checks = {
    api: true,
    // Add more checks as needed
  };

  const allReady = Object.values(checks).every(Boolean);

  return c.json(
    {
      ready: allReady,
      checks,
      timestamp: new Date().toISOString(),
    },
    allReady ? 200 : 503
  );
});

export default health;
