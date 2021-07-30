import fastifyLoader from './fastify';
import mongooseLoader from './mongoose';
import modulesLoader from './modules';

import logger from '../logger';

export default async ({ fastifyApp }): Promise<any> => {
  const mongoConnection = await mongooseLoader();
  logger.info('MongoDB Initialized');

  await fastifyLoader({ app: fastifyApp });
  logger.info('Fastify Initialized');

  await modulesLoader();
  logger.info('Modules Initialized');

  return {
    mongoConnection,
  };
};
