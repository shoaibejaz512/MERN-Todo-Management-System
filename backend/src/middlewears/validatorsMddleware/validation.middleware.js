export const validate = (schema) => {
  return (req, res, next) => {
    const result = schema.safeParse(req.body);
   

    if (!result.success) {
      return res.status(400).json({
        success: false,
        errors: result.error.flatten().fieldErrors,
      });
    }

    // Replace req.body with validated data
    req.body = result.data;

    next();
  };
};
