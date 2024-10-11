const roles = ["admin", "user"];
const defRole = "user";
const phonePattern = /^(?:\+63|0)\d{10}$/;
const phoneError =
  "Invalid Philippine phone number format. Must start with +63 or 0 and be 11 digits long.";
const passwordPattern =   /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]+$/;
const passwordError =
  "Password must be at least 8 characters long and contain at least one uppercase letter, one lowercase letter, one special character, and one digit.";

module.exports = {
    roles,
    defRole,
    phonePattern,
    phoneError,
    passwordPattern,
    passwordError
}