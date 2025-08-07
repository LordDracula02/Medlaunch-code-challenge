import app from './app';
import {config} from './config';
import {logger} from './utils/logger';

const PORT = config.server.port;

const server = app.listen(PORT, () => {
  logger.info('🚀 Backend API server started', {
    port: PORT,
    environment: config.server.nodeEnv,
    timestamp: new Date().toISOString(),
  });

  console.log(`✅ Server running on port: ${PORT}`);
  console.log(`✅ Environment: ${config.server.nodeEnv}`);
  console.log(`✅ Health check: http://localhost:${PORT}/health`);
  console.log(`✅ API Base URL: http://localhost:${PORT}/api`);
});

// Handle server errors
server.on('error', (error: any) => {
  if (error.syscall !== 'listen') {
    throw error;
  }

  const bind = typeof PORT === 'string' ? `Pipe ${PORT}` : `Port ${PORT}`;

  switch (error.code) {
  case 'EACCES':
    logger.error(`${bind} requires elevated privileges`);
    process.exit(1);
  case 'EADDRINUSE':
    logger.error(`${bind} is already in use`);
    process.exit(1);
  default:
    throw error;
  }
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down server gracefully');
  server.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  logger.info('SIGINT received, shutting down server gracefully');
  server.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });
});

export default server;
