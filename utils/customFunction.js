const CryptoJS = require("crypto-js");
const {saltkey} = require("./saltkey");

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

module.exports = { decryptString, encryptString };
