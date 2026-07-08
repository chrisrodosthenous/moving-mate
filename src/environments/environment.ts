/**
 * Development / default build configuration.
 * Firebase keys match your Firebase console / deployment; FCM uses the same project as the service worker.
 */
export const environment = {
  production: false,
  /** Mock checkout until Stripe is integrated (matches server PAYMENTS_PROVIDER=mock). */
  mockPayments: true,
  /**
   * Referrer-restricted browser key for Maps JS + Places.
   * If left empty, the New Order page still renders (form + Places wait for API);
   * `<google-map>` is not mounted so Angular does not throw (see create-order template).
   */
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
