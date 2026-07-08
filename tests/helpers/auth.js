async function clearAuthStorage(page, baseURL = 'http://127.0.0.1:4200') {
  if (!page.url().startsWith('http')) {
    await page.goto(`${baseURL}/login`)
  }
  await page.evaluate(() => {
    localStorage.removeItem('moving_mate_token')
    localStorage.removeItem('moving_mate_user')
  })
}

async function gotoLoggedOut(page, url, baseURL = 'http://127.0.0.1:4200') {
  await clearAuthStorage(page, baseURL)
  await page.goto(url)
}

module.exports = {
  clearAuthStorage,
  gotoLoggedOut,
}
