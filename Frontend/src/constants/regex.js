export const REGEX = Object.freeze({
  email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  strongPassword: /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/,
  phone: /^\+?[1-9]\d{7,14}$/,
});
