import { v2 as cloudinary } from "cloudinary";

export const deleteFromCloudinary = async (publicId) => {
  if (!publicId) return;

  const result = await cloudinary.uploader.destroy(publicId);

  return result;
};
