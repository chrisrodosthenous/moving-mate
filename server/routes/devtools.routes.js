/**
 * Development Tools Routes
 * 
 * These routes are ONLY available in development mode.
 * They allow the frontend theme editor to save changes directly to global.css.
 */

const express = require('express');
const fs = require('fs');
const path = require('path');

const router = express.Router();

// Only enable in development
const isDev = process.env.NODE_ENV !== 'production';

/**
 * Path to the global.css file
 */
const GLOBAL_CSS_PATH = path.join(__dirname, '..', '..', 'src', 'global.css');

/**
 * POST /api/devtools/save-theme
 * 
 * Saves theme variable changes to global.css
 * 
 * Body: { variables: { '--background': '210 100% 11%', '--primary': '204 71% 70%', ... } }
 */
router.post('/save-theme', async (req, res) => {
  // Block in production
  if (!isDev) {
    return res.status(403).json({
      success: false,
      message: 'Theme editing is disabled in production mode.',
    });
  }

  const { variables } = req.body;

  if (!variables || typeof variables !== 'object') {
    return res.status(400).json({
      success: false,
      message: 'Invalid request body. Expected { variables: { ... } }',
    });
  }

  try {
    // Read the current global.css
    if (!fs.existsSync(GLOBAL_CSS_PATH)) {
      return res.status(404).json({
        success: false,
        message: `global.css not found at ${GLOBAL_CSS_PATH}`,
      });
    }

    let cssContent = fs.readFileSync(GLOBAL_CSS_PATH, 'utf8');

    // Update each variable in the CSS
    for (const [varName, value] of Object.entries(variables)) {
      if (!varName.startsWith('--')) continue;
      
      // Match the variable declaration with various formats
      // Handles: --varname: value; with optional comments
      const varRegex = new RegExp(
        `(${escapeRegex(varName)}:\\s*)([^;]+)(;)`,
        'g'
      );

      const newValue = String(value).trim();
      
      if (varRegex.test(cssContent)) {
        cssContent = cssContent.replace(varRegex, `$1${newValue}$3`);
      }
    }

    // Write the updated CSS back to file
    fs.writeFileSync(GLOBAL_CSS_PATH, cssContent, 'utf8');

    console.log(`[DevTools] Theme saved to ${GLOBAL_CSS_PATH}`);
    console.log(`[DevTools] Updated ${Object.keys(variables).length} variables`);

    res.json({
      success: true,
      message: 'Theme saved successfully to global.css',
      updatedVariables: Object.keys(variables).length,
    });

  } catch (error) {
    console.error('[DevTools] Error saving theme:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to save theme',
    });
  }
});

/**
 * GET /api/devtools/theme
 * 
 * Returns the current theme variables from global.css
 */
router.get('/theme', async (req, res) => {
  if (!isDev) {
    return res.status(403).json({
      success: false,
      message: 'Theme reading is disabled in production mode.',
    });
  }

  try {
    if (!fs.existsSync(GLOBAL_CSS_PATH)) {
      return res.status(404).json({
        success: false,
        message: 'global.css not found',
      });
    }

    const cssContent = fs.readFileSync(GLOBAL_CSS_PATH, 'utf8');

    // Extract all CSS variables from :root block
    const variables = {};
    const varRegex = /(--[\w-]+):\s*([^;]+);/g;
    let match;

    while ((match = varRegex.exec(cssContent)) !== null) {
      variables[match[1]] = match[2].trim();
    }

    res.json({
      success: true,
      variables,
      path: GLOBAL_CSS_PATH,
    });

  } catch (error) {
    console.error('[DevTools] Error reading theme:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to read theme',
    });
  }
});

/**
 * POST /api/devtools/backup-theme
 * 
 * Creates a backup of the current global.css
 */
router.post('/backup-theme', async (req, res) => {
  if (!isDev) {
    return res.status(403).json({
      success: false,
      message: 'Theme backup is disabled in production mode.',
    });
  }

  try {
    if (!fs.existsSync(GLOBAL_CSS_PATH)) {
      return res.status(404).json({
        success: false,
        message: 'global.css not found',
      });
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = GLOBAL_CSS_PATH.replace('.css', `.backup-${timestamp}.css`);

    fs.copyFileSync(GLOBAL_CSS_PATH, backupPath);

    console.log(`[DevTools] Theme backup created at ${backupPath}`);

    res.json({
      success: true,
      message: 'Backup created successfully',
      backupPath,
    });

  } catch (error) {
    console.error('[DevTools] Error creating backup:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to create backup',
    });
  }
});

/**
 * Escape special regex characters
 */
function escapeRegex(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

module.exports = router;
