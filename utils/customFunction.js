const CryptoJS = require("crypto-js");
const {saltkey} = require("./saltkey");
const crypto = require("crypto");

const decryptString = (data) => {
  if (!data) return null;
  const bytes = CryptoJS.AES.decrypt(data, saltkey);
  const decryptedData = JSON.parse(bytes.toString(CryptoJS.enc.Utf8));
  return decryptedData;
};

const encryptString = (data) => {
  if (!data) return null;
  const ciphertext = CryptoJS.AES.encrypt(
    JSON.stringify(data),
    saltkey
  ).toString();
  return ciphertext;
};

const generateToken = () => {
  return crypto.randomBytes(32).toString('hex');
}

module.exports = { decryptString, encryptString, generateToken };
