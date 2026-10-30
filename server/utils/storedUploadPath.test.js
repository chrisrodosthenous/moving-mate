const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const {
  publicUploadPath,
  absoluteUploadPath,
  contentTypeForUpload,
} = require('./storedUploadPath');

describe('storedUploadPath', () => {
  it('keeps a driver document path under /uploads', () => {
    assert.equal(
      publicUploadPath('/uploads/driver-documents/123-vehiclePhoto-car.jpg'),
      '/uploads/driver-documents/123-vehiclePhoto-car.jpg',
    );
  });

  it('rejects paths that leave the uploads directory', () => {
    assert.equal(publicUploadPath('/uploads/../server.js'), null);
    assert.equal(publicUploadPath('/uploads/driver-documents/../../.env'), null);
    assert.equal(publicUploadPath('/etc/passwd'), null);
    assert.equal(publicUploadPath('uploads/licenses/a.jpg'), null);
  });

  it('resolves a file inside the uploads root', () => {
    const root = path.join('C:\\data', 'uploads');
    const absolute = absoluteUploadPath(root, '/uploads/licenses/a.jpg');
    assert.equal(absolute, path.resolve(root, 'licenses', 'a.jpg'));
  });

  it('refuses a disk path outside the uploads root', () => {
    const root = path.join('C:\\data', 'uploads');
    assert.equal(absoluteUploadPath(root, '/uploads/../secret.txt'), null);
  });

  it('accepts jpeg, png, and pdf only', () => {
    assert.equal(contentTypeForUpload('image/jpg', '/uploads/licenses/a.jpg'), 'image/jpeg');
    assert.equal(contentTypeForUpload('image/png', '/uploads/licenses/a.png'), 'image/png');
    assert.equal(contentTypeForUpload('', '/uploads/licenses/a.pdf'), 'application/pdf');
    assert.equal(contentTypeForUpload('text/html', '/uploads/licenses/a.html'), null);
  });
});
