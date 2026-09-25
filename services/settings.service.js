import { prisma } from "../config/prisma.js";
import { deleteFileFromS3, uploadFileToS3 } from "./s3.service.js";

const settingsSelect = {
  id: true,
  timezone: true,
  timeFormat: true,
  currency: true,
  weekStartDay: true,
  recurringBehaviour: true,
  emailNotification: true,
  mobileNotification: true,
  notifyDays: true,
  updatedAt: true,
  user: {
    select: {
      firstName: true,
      lastName: true,
      email: true,
      phoneNumber: true,
      profileImageUrl: true,
    },
  },
};

const formatSettings = ({ user, ...settings }) => ({
  ...settings,
  firstName: user.firstName,
  lastName: user.lastName,
  email: user.email,
  phoneNumber: user.phoneNumber,
  profileImageUrl: user.profileImageUrl,
});

const userFieldsMap = {
  first_name: "firstName",
  last_name: "lastName",
  email: "email",
  phone_number: "phoneNumber",
};

const splitData = (data) => {
  const userData = {};
  const settingsData = {};

  for (const [key, value] of Object.entries(data)) {
    const userField = userFieldsMap[key];
    if (userField) {
      userData[userField] = value;
    } else {
      settingsData[key] = value;
    }
  }

  return { userData, settingsData };
};

/*
|--------------------------------------------------------------------------
| Get Settings
|--------------------------------------------------------------------------
| Creates default settings if the user doesn't have any yet.
*/
export const getSettings = async (userId) => {
  const settings = await prisma.settings.upsert({
    where: { userId },
    update: {},
    create: { userId },
    select: settingsSelect,
  });

  return formatSettings(settings);
};

/*
|--------------------------------------------------------------------------
| Update Settings
|--------------------------------------------------------------------------
*/
export const updateSettings = async (userId, data, file) => {
  const { userData, settingsData } = splitData(data);

  let profileImageUrl;

  if (file) {
    profileImageUrl = await uploadFileToS3(file, "Profile", userId);

    const currentUser = await prisma.user.findUnique({
      where: { id: userId },
      select: { profileImageUrl: true },
    });

    if (currentUser?.profileImageUrl) {
      await deleteFileFromS3(currentUser.profileImageUrl);
    }
  }

  const userUpdate = { ...userData, ...(profileImageUrl && { profileImageUrl }) };

  const results = await prisma.$transaction([
    ...(Object.keys(userUpdate).length
      ? [
          prisma.user.update({
            where: { id: userId },
            data: userUpdate,
          }),
        ]
      : []),
    prisma.settings.upsert({
      where: { userId },
      update: { ...settingsData },
      create: { userId, ...settingsData },
      select: settingsSelect,
    }),
  ]);

  return formatSettings(results[results.length - 1]);
};
