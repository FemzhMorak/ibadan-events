// Service worker registration + Web Push subscription for the 7am morning
// digest notification ("N events happening in Ibadan today").
const PUSH_OPTED_KEY = 'ibadanevents.pushOptedIn';

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) outputArray[i] = rawData.charCodeAt(i);
  return outputArray;
}

const PushModule = {
  async registerServiceWorker() {
    if (!('serviceWorker' in navigator)) return null;
    try {
      return await navigator.serviceWorker.register('/service-worker.js');
    } catch (err) {
      console.warn('Service worker registration failed:', err);
      return null;
    }
  },

  hasOptedIn() {
    return localStorage.getItem(PUSH_OPTED_KEY) === 'true';
  },

  async subscribeForDigest() {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return false;

    const permission = await Notification.requestPermission();
    if (permission !== 'granted') return false;

    try {
      const registration = await navigator.serviceWorker.ready;
      const { publicKey, configured } = await Api.vapidPublicKey();
      if (!configured || !publicKey) {
        console.warn('Push not configured on the server (missing VAPID keys)');
        return false;
      }

      let subscription = await registration.pushManager.getSubscription();
      if (!subscription) {
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey),
        });
      }

      await Api.subscribePush(subscription);
      localStorage.setItem(PUSH_OPTED_KEY, 'true');
      return true;
    } catch (err) {
      console.warn('Push subscription failed:', err);
      return false;
    }
  },
};
