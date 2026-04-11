import { generateUploadButton, generateUploadDropzone, generateUploader, generateReactHelpers } from "@uploadthing/react";

type OurFileRouter = any;

export const Uploader: ReturnType<typeof generateUploader> = generateUploader<OurFileRouter>();
export const UploadButton: ReturnType<typeof generateUploadButton> = generateUploadButton<OurFileRouter>();
export const UploadDropzone: ReturnType<typeof generateUploadDropzone> = generateUploadDropzone<OurFileRouter>();

const helpers = generateReactHelpers<OurFileRouter>();

export const useUploadThing: any = helpers.useUploadThing;
export const uploadFiles: any = helpers.uploadFiles;
