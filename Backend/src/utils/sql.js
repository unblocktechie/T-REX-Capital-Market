const sqlInteger = (value, { min = 0, max = Number.MAX_SAFE_INTEGER, name = 'SQL integer' } = {}) => {
  const integer = Math.trunc(Number(value));
  if (!Number.isSafeInteger(integer) || integer < min || integer > max) {
    throw new TypeError(`${name} must be a safe integer between ${min} and ${max}.`);
  }
  return String(integer);
};

module.exports = { sqlInteger };
