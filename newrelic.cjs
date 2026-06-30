'use strict';

exports.config = {
  app_name: [process.env.NEW_RELIC_APP_NAME || 'nestjs-starter-application'],
  license_key: process.env.NEW_RELIC_LICENSE_KEY,
  logging: {
    level: 'info',
  },
  application_logging: {
    enabled: true,
    forwarding: {
      enabled: true,
    },
    local_decorating: {
      enabled: false,
    },
    metrics: {
      enabled: true,
    },
  },
  distributed_tracing: {
    enabled: true,
  },
  allow_all_headers: true,
  attributes: {
    exclude: [
      'request.headers.cookie',
      'request.headers.authorization',
      'request.headers.proxyAuthorization',
      'request.headers.setCookie*',
      'request.headers.x*',
      'response.headers.cookie',
      'response.headers.authorization',
      'response.headers.setCookie*',
    ],
  },
};
