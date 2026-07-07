export default {
  shutdown: (_opts: unknown, cb?: () => void) => cb?.(),
  noticeError: jest.fn(),
  recordMetric: jest.fn(),
  setLambdaHandler: jest.fn(),
  getTransaction: jest.fn(),
  addCustomAttribute: jest.fn(),
};
