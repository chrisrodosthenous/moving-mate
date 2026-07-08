/**
 * Production build (via angular.json fileReplacements).
 * Inject keys at build time via CI secrets or keep defaults for staging.
 */
export const environment = {
  production: true,
  /** Production testing phase: mock authorize/capture. Set false when Stripe is live. */
  mockPayments: true,
  googleMapsApiKey: 'AIzaSyBZRuC0W63c6UnB5l73Ahi7M5V0vinhBqQ',

  firebase: {
    apiKey: 'AIzaSyB5_oJxsXsi7nuJiYhV1c3vJGQrIc05ZGw',
    authDomain: 'moving-mate-24fc3.firebaseapp.com',
    projectId: 'moving-mate-24fc3',
    storageBucket: 'moving-mate-24fc3.appspot.com',
    messagingSenderId: '498646906372',
    appId: '1:498646906372:web:e0c27b35260dc5fc32e751',
  },

  firebaseVapidKey:
    'BBF8EKYfWLGMlkzF3cgF3O_LHycCx7hyE7q6Et57I_AC0apbzLJ4Jv6XffFazmp--9seX0e9xtEqe9YzCv1kMiA',
};
