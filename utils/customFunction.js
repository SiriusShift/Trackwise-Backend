import CryptoJS from "crypto-js";
import {saltkey} from "./saltkey.js";
import crypto from "crypto";

export const decryptString = (data) => {
  if (!data) return null;
  const bytes = CryptoJS.AES.decrypt(data, saltkey);
  const decryptedData = JSON.parse(bytes.toString(CryptoJS.enc.Utf8));
  return decryptedData;
};

export const encryptString = (data) => {
  if (!data) return null;
  const ciphertext = CryptoJS.AES.encrypt(
    JSON.stringify(data),
    saltkey
  ).toString();
  return ciphertext;
};

export const generateToken = () => {
  return crypto.randomBytes(32).toString('hex');
}
