export const roles = ["admin", "user"];
export const defRole = "user";
export const phonePattern = /^(?:\+63|0)\d{10}$/;
export const phoneError =
  "Invalid Philippine phone number format. Must start with +63 or 0 and be 11 digits long.";
export const passwordPattern =
  /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+])[A-Za-z\d!@#$%^&*()_+]{8,}$/;
export const passwordError =
  "Password must be at least 8 characters long and contain at least one uppercase letter, one lowercase letter, one special character, and one digit.";

