export function errorHandler(error, req, res, next) {
  console.error("ULTRON ERROR:", error);

  if (res.headersSent) {
    return next(error);
  }

  const status = Number(error.status) || 500;

  res.status(
    status >= 400 && status < 600 ? status : 500
  ).json({
    success: false,
    error:
      status >= 500
        ? "Ultron is temporarily unable to process this request."
        : error.message
  });
}
