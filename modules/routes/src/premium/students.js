// Basurto keeps student records in the central application, never in this editor.
export const FICHA_KEY='basurto-premium-ficha';
export const readStudents=()=>({students:{}});
export const migrateStudents=readStudents;
export const writeStudents=()=>{throw Error('Gestiona los alumnos desde la agenda central de Basurto.');};
export const validateStudents=value=>{if(Object.keys(value?.students||{}).length)throw Error('Esta copia contiene alumnos de otra aplicación. Importa solo recorridos y explicaciones.');return value;};
export const mergeStudents=(a,b)=>{validateStudents(a);validateStudents(b);return {students:{}};};
