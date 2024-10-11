class ExpressError extends Error {
  constructor(message, statusCode) {
    super();
    this.message = message;
    this.statusCode = statusCode || undefined;
  }
}

module.exports = ExpressError;