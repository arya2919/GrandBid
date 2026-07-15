import { 
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword, 
  signOut, 
  sendPasswordResetEmail,
  GoogleAuthProvider,
  getRedirectResult,
  signInWithRedirect,
  updateProfile 
} from 'firebase/auth';
import { 
  doc, 
  setDoc, 
  getDoc, 
  updateDoc, 
  serverTimestamp 
} from 'firebase/firestore';
import { 
  ref, 
  uploadBytes, 
  getDownloadURL 
} from 'firebase/storage';
import { auth, db, storage } from './firebase';

const isFirestoreConnectivityError = (error) => [
  'unavailable',
  'deadline-exceeded',
  'failed-precondition'
].includes(error?.code);

export const getFirebaseErrorMessage = (error, fallback = 'Something went wrong. Please try again.') => {
  const messages = {
    'auth/email-already-in-use': 'This email is already registered. Please log in instead.',
    'auth/invalid-email': 'Please enter a valid email address.',
    'auth/invalid-credential': 'Invalid email or password. Please check your credentials.',
    'auth/user-not-found': 'No account was found with this email. Please register first.',
    'auth/wrong-password': 'Incorrect password. Please try again.',
    'auth/popup-closed-by-user': 'Google sign-in was cancelled.',
    'auth/popup-blocked': 'Your browser blocked the Google sign-in window. Please allow pop-ups and try again.',
    'auth/network-request-failed': 'Network error. Check your internet connection and try again.'
  };

  return messages[error?.code] || fallback;
};

// Create user document in Firestore
export const createUserDocument = async (user, additionalData = {}) => {
  if (!user) return;
  
  const userRef = doc(db, 'users', user.uid);
  let userSnap;
  try {
    userSnap = await getDoc(userRef);
  } catch (error) {
    // Authentication can succeed while Firestore is temporarily unreachable.
    // Do not report that as a failed sign-in; the auth state remains valid and
    // Firestore will be retried on the next session.
    if (isFirestoreConnectivityError(error)) return null;
    throw error;
  }
  
  if (!userSnap.exists()) {
    const { displayName, email, photoURL } = user;
    const createdAt = serverTimestamp();
    const lastLoginAt = serverTimestamp();
    
    try {
      await setDoc(userRef, {
        displayName: displayName || additionalData.name || '',
        email,
        photoURL: photoURL || additionalData.photoURL || '',
        createdAt,
        lastLoginAt,
        role: 'bidder', // Default role
        ...additionalData
      });
    } catch (error) {
      if (isFirestoreConnectivityError(error)) return null;
      throw error;
    }
  } else {
    // Update last login time for existing users
    try {
      await updateDoc(userRef, {
        lastLoginAt: serverTimestamp()
      });
    } catch (error) {
      if (!isFirestoreConnectivityError(error)) throw error;
    }
  }
  
  return userRef;
};

// Get user document from Firestore
export const getUserDocument = async (uid) => {
  if (!uid) return null;
  
  try {
    const userRef = doc(db, 'users', uid);
    const userSnap = await getDoc(userRef);
    
    if (userSnap.exists()) {
      return { uid, ...userSnap.data() };
    }
    return null;
  } catch (error) {
    if (isFirestoreConnectivityError(error)) return null;
    throw error;
  }
};

// Upload profile picture
export const uploadProfilePicture = async (file, uid) => {
  if (!file || !uid) return null;
  
  try {
    const fileRef = ref(storage, `profile-pictures/${uid}`);
    const snapshot = await uploadBytes(fileRef, file);
    const downloadURL = await getDownloadURL(snapshot.ref);
    
    // Update user profile in auth
    await updateProfile(auth.currentUser, {
      photoURL: downloadURL
    });
    
    // Update user document in Firestore
    const userRef = doc(db, 'users', uid);
    await updateDoc(userRef, {
      photoURL: downloadURL
    });
    
    return downloadURL;
  } catch (error) {
    console.error('Error uploading profile picture:', error);
    throw error;
  }
};

// Sign up with email and password
export const signUpWithEmailAndPassword = async (
  email,
  password,
  name,
  profilePicture = null,
  role = 'bidder'
) => {
  const { user } = await createUserWithEmailAndPassword(auth, email, password);

    // Update auth profile
    await updateProfile(user, {
      displayName: name,
      photoURL: ''
    });

    // Create the document before uploading a picture. The upload helper updates
    // this document, so uploading first fails for newly registered users.
    await createUserDocument(user, { 
      name,
      photoURL: '',
      role
    });

    if (profilePicture) {
      await uploadProfilePicture(profilePicture, user.uid);
    }
    
  return user;
};

// Sign in with email and password
export const signInWithEmailAndPassword_ = async (email, password) => {
  const { user } = await signInWithEmailAndPassword(auth, email, password);
    
    // Update last login time
    await createUserDocument(user);
    
  return user;
};

// Start Google authentication with a full-page redirect. This avoids popup
// polling, which triggers Cross-Origin-Opener-Policy warnings in Chrome.
export const signInWithGoogle = async (role = 'bidder') => {
  const provider = new GoogleAuthProvider();
  window.sessionStorage.setItem('grandbid-google-role', role);
  await signInWithRedirect(auth, provider);
};

// Complete a Google redirect after Firebase returns the user to the app.
export const completeGoogleRedirect = async () => {
  const result = await getRedirectResult(auth);
  if (!result?.user) return null;

  const role = window.sessionStorage.getItem('grandbid-google-role') || 'bidder';
  window.sessionStorage.removeItem('grandbid-google-role');
  await createUserDocument(result.user, { role });
  window.location.replace(role === 'bidder' ? '/bidder/dashboard' : '/bidder-dashboard');
  return result.user;
};

// Sign out
export const signOut_ = async () => {
  try {
    await signOut(auth);
  } catch (error) {
    console.error('Error signing out:', error);
    throw error;
  }
};

// Reset password
export const resetPassword = async (email) => {
  try {
    await sendPasswordResetEmail(auth, email);
  } catch (error) {
    console.error('Error sending password reset email:', error);
    throw error;
  }
};

// Update user profile
export const updateUserProfile = async (uid, updates) => {
  try {
    const userRef = doc(db, 'users', uid);
    await updateDoc(userRef, {
      ...updates,
      updatedAt: serverTimestamp()
    });
  } catch (error) {
    console.error('Error updating user profile:', error);
    throw error;
  }
};
