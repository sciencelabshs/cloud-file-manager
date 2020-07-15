import { TokenServiceClient, S3Resource } from "@concord-consortium/token-service";
import S3 from "aws-sdk/clients/s3";
import {
  DEFAULT_MAX_AGE_SECONDS,
  getTokenServiceEnv,
  TOKEN_SERVICE_TOOL_NAME,
  TOKEN_SERVICE_TOOL_TYPE,
  S3_SHARED_DOC_PATH_LEGACY
} from './config'

interface ICreateFile {
  fileContent: string;
  firebaseJwt?: string;
}

// Token Service creates a (sub)folder in a S3 bucket and gives access to it. Multiple files can be created there,
// but it's not desired in CFM. In fact each new subfolder should include just one file - CFM document.
// Note that this filename should probably be NEVER changed. Users might want to update shared view and things
// work as long as they write to a correct file. Why file.json? That's what document-store migration script used:
// https://github.com/concord-consortium/document-store/blob/master/token-service-migration/index.js#L173
// These helpers were using CFM document filename before. But it's incorrect, as each time user changes this name,
// sharing functionality will break. See: https://www.pivotaltracker.com/story/show/173817843
const FILENAME = "file.json"

export const createFile = async ({ fileContent, firebaseJwt }: ICreateFile) => {
  // This function optionally accepts firebaseJWT. There are three things that depend on authentication method:
  // - TokenServiceClient constructor arguments. If user should be authenticated during every call to the API, provide `jwt` param.
  // - createResource call. If user is not authenticated, "readWriteToken" accessRule type must be used. Token Service will generate and return readWriteToken.
  // - getCredentials call. If user is not authenticated, readWriteToken needs to be provided instead.
  const anonymous = !firebaseJwt;

  const client = anonymous
    ? new TokenServiceClient({ env: getTokenServiceEnv() })
    : new TokenServiceClient({ env: getTokenServiceEnv(), jwt: firebaseJwt })
  const resource: S3Resource = await client.createResource({
    tool: TOKEN_SERVICE_TOOL_NAME,
    type: TOKEN_SERVICE_TOOL_TYPE,
    name: FILENAME,
    description: "Document created by CFM",
    accessRuleType: anonymous ? "readWriteToken" : "user"
  }) as S3Resource;

  // Note that if your file ever needs to get updated, this token MUST BE (SECURELY) SAVED.
  let readWriteToken = "";
  if (anonymous) {
    readWriteToken = client.getReadWriteToken(resource) || "";
  }

  const credentials = anonymous
    ? await client.getCredentials(resource.id, readWriteToken)
    : await client.getCredentials(resource.id);


  // S3 configuration is based both on resource and credentials info.
  const { bucket, region } = resource;
  const { accessKeyId, secretAccessKey, sessionToken } = credentials;
  const s3 = new S3({ region, accessKeyId, secretAccessKey, sessionToken });
  const publicPath = client.getPublicS3Path(resource, FILENAME);

  const result = await s3.upload({
    Bucket: bucket,
    Key: publicPath,
    Body: fileContent,
    ContentType: "text/html",
    ContentEncoding: "UTF-8",
    // Remember to update "~SHARE_UPDATE.MESSAGE" message when caching time is updated.
    CacheControl: `max-age=${DEFAULT_MAX_AGE_SECONDS}`
  }).promise();
  console.log(result);

  return {
    publicUrl: client.getPublicS3Url(resource, FILENAME),
    resourceId: resource.id,
    readWriteToken
  };
};

interface IUpdateFileArgs {
  newFileContent: string;
  resourceId: string;
  firebaseJwt?: string;
  readWriteToken?: string;
}
export const updateFile = async ({ newFileContent, resourceId, firebaseJwt, readWriteToken }: IUpdateFileArgs) => {
  // This function accepts either firebaseJWT or readWriteToken. There are only two things that depend on authentication method:
  // - TokenServiceClient constructor arguments. If user should be authenticated during every call to the API, provide `jwt` param.
  // - getCredentials call. If user is not authenticated, readWriteToken needs to be provided instead.
  const anonymous = !firebaseJwt && readWriteToken;

  const client = anonymous
    ? new TokenServiceClient({ env: getTokenServiceEnv() })
    : new TokenServiceClient({ env: getTokenServiceEnv(), jwt: firebaseJwt })

  const resource: S3Resource = await client.getResource(resourceId) as S3Resource;
  const credentials = anonymous
    ? await client.getCredentials(resource.id, readWriteToken)
    : await client.getCredentials(resource.id);

  // S3 configuration is based both on resource and credentials info.
  const { bucket, region } = resource;
  const { accessKeyId, secretAccessKey, sessionToken } = credentials;
  const s3 = new S3({ region, accessKeyId, secretAccessKey, sessionToken });
  const publicPath = client.getPublicS3Path(resource, FILENAME);
  const publicUrl = client.getPublicS3Url(resource, FILENAME);
  const result = await s3.upload({
    Bucket: bucket,
    Key: publicPath,
    Body: newFileContent,
    ContentType: "text/html",
    ContentEncoding: "UTF-8",
    // Remember to update "~SHARE_UPDATE.MESSAGE" message when caching time is updated.
    CacheControl: `max-age=${DEFAULT_MAX_AGE_SECONDS}`
  }).promise();
  return {
    result,
    bucket,
    publicPath,
    publicUrl
  }
};

const getBaseDocumentUrl = () => {
  const stagingBase = "https://token-service-files.concordqa.org"
  const productionBase = "https://models-resources.concord.org"
  return getTokenServiceEnv() === "production" ? productionBase : stagingBase
}

// documentId is a legacy DocStore document ID. DocStore migration script creates a special folder that has object
// with names matching these IDs. They redirect to a final location in S3.
export const getLegacyUrl = (documentId: string) => {
  return `${getBaseDocumentUrl()}/${S3_SHARED_DOC_PATH_LEGACY}/${documentId}`
};
