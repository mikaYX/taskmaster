import * as fs from 'fs';
import * as path from 'path';

const googleFixture = JSON.parse(
  fs.readFileSync(
    path.join(__dirname, 'fixtures/google-id-token.json'),
    'utf8',
  ),
);
const azureFixture = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'fixtures/azure-id-token.json'), 'utf8'),
);

export const mockState = {
  googleClaims: { ...googleFixture },
  azureClaims: { ...azureFixture },
  samlProfile: {
    email: 'test.user@saml.com',
    displayname: 'Test SAML User',
    nameID: 'test.user@saml.com',
  } as any,
};
