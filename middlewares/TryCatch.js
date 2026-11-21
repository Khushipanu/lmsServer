// Wraps async controllers so thrown errors become clean JSON responses
// instead of crashing the request.
const TryCatch = (handler) => async (req, res, next) => {
  try {
    await handler(req, res, next);
  } catch (err) {
    next(err);
  }
};

export default TryCatch;
