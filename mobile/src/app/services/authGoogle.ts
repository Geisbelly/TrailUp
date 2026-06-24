// import * as Google from 'expo-auth-session/providers/google';
// import * as WebBrowser from 'expo-web-browser';
// import { useEffect, useState } from 'react';
// import { Platform } from 'react-native';
// import { makeRedirectUri } from 'expo-auth-session';

// WebBrowser.maybeCompleteAuthSession();

// export function useGoogleAuth() {
//   const [userInfo, setUserInfo] = useState<any>(null);

//   const [request, response, promptAsync] = Google.useAuthRequest({
//     clientId: Platform.OS === 'web'
//       ? '786259512060-jgbr1fq9kcf1e8llaah5qigir0k2l8f5.apps.googleusercontent.com' // Web
//       : '786259512060-snmo6uk2seifth6tefu4rodp9uvcm5u2.apps.googleusercontent.com', // Android
//     scopes: ['profile', 'email'],
//     redirectUri: makeRedirectUri({
//       useProxy: true, // compatível com Expo Go
//     } as any),   
//   });

//   useEffect(() => {
//     const getUserInfo = async () => {
//       if (response?.type === 'success' && response.authentication?.accessToken) {
//         try {
//           const res = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
//             headers: {
//               Authorization: `Bearer ${response.authentication.accessToken}`,
//             },
//           });
//           const user = await res.json();
//           console.log('✅ Usuário Google:', user);
//           setUserInfo(user);
//         } catch (error) {
//           console.error('Erro ao buscar usuário:', error);
//         }
//       }
//     };

//     getUserInfo();
//   }, [response]);

//   return {
//     request,
//     promptAsync,
//     userInfo,
//   };
// }