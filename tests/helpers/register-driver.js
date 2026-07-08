/** Minimal valid 1×1 JPEG (base64) for driver document uploads in E2E. */
const MIN_JPEG_BASE64 =
  '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAv/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAF8A/9k='

function minJpegBuffer() {
  return Buffer.from(MIN_JPEG_BASE64, 'base64')
}

/**
 * Register a driver via multipart POST /api/auth/register-driver.
 * @param {import('@playwright/test').APIRequestContext} backend
 */
async function registerDriverViaApi(
  backend,
  {
    firstName = 'E2E',
    lastName = 'Driver',
    email,
    password,
    phoneNumber,
    dateOfBirth = '1990-01-01',
    districts = ['Nicosia'],
    vehicleType = 'pickup',
    includeLicense = true,
    includeVehiclePhoto = true,
  },
) {
  const jpegBuf = minJpegBuffer()
  const multipart = {
    firstName,
    lastName,
    email,
    password,
    phoneNumber,
    dateOfBirth,
    role: 'driver',
    districts: JSON.stringify(districts),
    vehicleType,
  }
  if (includeLicense) {
    multipart.drivingLicense = {
      name: 'lic.jpg',
      mimeType: 'image/jpeg',
      buffer: jpegBuf,
    }
  }
  if (includeVehiclePhoto) {
    multipart.vehiclePhoto = {
      name: 'vehicle.jpg',
      mimeType: 'image/jpeg',
      buffer: jpegBuf,
    }
  }
  return backend.post('/api/auth/register-driver', { multipart })
}

/** Fill vehicle type + photo on the register UI (driver role must already be selected). */
async function fillDriverVehicleSignup(page, vehiclePhotoPath) {
  await page.locator('select[formcontrolname="vehicleType"]').selectOption('pickup')
  await page.locator('#vehiclePhoto').setInputFiles(vehiclePhotoPath)
}

/** Navigate driver to available jobs list (where accept-order test IDs live). */
async function gotoDriverAvailableJobs(page, baseURL) {
  await page.goto(`${baseURL}/driver/available`)
  await page.getByTestId('driver-available-orders').waitFor({ state: 'visible', timeout: 15000 })
}

module.exports = {
  MIN_JPEG_BASE64,
  minJpegBuffer,
  registerDriverViaApi,
  fillDriverVehicleSignup,
  gotoDriverAvailableJobs,
}
