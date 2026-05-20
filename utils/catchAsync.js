// utils/catchAsync.js

const catchAsync = (routeHandler) => {
  return (req, res, next) => {
    Promise.resolve(routeHandler(req, res, next)).catch(next);
  };
};

export default catchAsync;