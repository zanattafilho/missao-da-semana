// Cole aqui a configuracao do app Web criada no Firebase Console.
// Esta configuracao identifica o projeto, mas nao substitui regras de seguranca.
export const firebaseConfig = {
  apiKey: "AIzaSyC6Ep2drtZYE2XTN0RYqrwVLILyg0Rc5ZY",
  authDomain: "missao-da-semana.firebaseapp.com",
  projectId: "missao-da-semana",
  storageBucket: "missao-da-semana.firebasestorage.app",
  messagingSenderId: "1008740924838",
  appId: "1:1008740924838:web:c66c1d9b838a9f4ea96367",
  measurementId: "G-FCQ5WK860W"
};

// Use um identificador dificil de adivinhar se o repositorio for publico.
// O mesmo valor deve aparecer nas regras do Firestore.
export const firebaseOptions = {
  familyId: "familia-zanatta"
};
