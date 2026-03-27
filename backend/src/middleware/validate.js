/**
 * Lightweight request validation middleware.
 * Usage: router.post('/', validate(schema), handler)
 *
 * schema: { field: { type, required, min, max } }
 */
function validate(schema) {
  return (req, res, next) => {
    const errors = [];

    for (const [field, rules] of Object.entries(schema)) {
      const value = req.body[field];

      if (rules.required && (value === undefined || value === null || value === '')) {
        errors.push(`${field} is required`);
        continue;
      }

      if (value === undefined || value === null) continue;

      if (rules.type === 'number') {
        const num = Number(value);
        if (isNaN(num)) { errors.push(`${field} must be a number`); continue; }
        if (rules.min !== undefined && num < rules.min) errors.push(`${field} must be >= ${rules.min}`);
        if (rules.max !== undefined && num > rules.max) errors.push(`${field} must be <= ${rules.max}`);
      }

      if (rules.type === 'string') {
        if (typeof value !== 'string') { errors.push(`${field} must be a string`); continue; }
        if (rules.minLength && value.trim().length < rules.minLength)
          errors.push(`${field} must be at least ${rules.minLength} characters`);
        if (rules.maxLength && value.trim().length > rules.maxLength)
          errors.push(`${field} must be at most ${rules.maxLength} characters`);
      }

      if (rules.enum && !rules.enum.includes(value)) {
        errors.push(`${field} must be one of: ${rules.enum.join(', ')}`);
      }
    }

    if (errors.length > 0) {
      return res.status(400).json({ success: false, errors });
    }

    next();
  };
}

module.exports = validate;
