// SPDX-FileCopyrightText: 2026 Aitor Delgado Martínez · AD Mobility
// SPDX-License-Identifier: LicenseRef-RutasAD-Educational-NonCommercial-1.0
import {readStudents,writeStudents} from './students.js';
export const routeReference=entry=>({key:entry.key,kind:entry.kind,projectId:entry.projectId,routeId:entry.routeId,sessionId:entry.review?.sessionId,libraryId:entry.review?.libraryId,name:entry.name});
export function usesEntry(ref,entry){return ref.key===entry.key||!!(ref.sessionId&&ref.sessionId===entry.review?.sessionId)||!!(ref.libraryId&&ref.libraryId===entry.review?.libraryId);}
export function studentUsesEntry(student,entry){
 const owner=entry.review?.studentId||entry.studentId;
 return (student.rutas||[]).some(r=>usesEntry(r,entry))||!!(owner&&(student.id===owner||student.rutasadPreviousIds?.includes(owner)))||Object.values(student.permits).some(p=>p.history.some(c=>(c.rutas||[]).some(r=>usesEntry(r,entry))));
}
// One atomic student-document write: store references, never copy GPX or video.
export function assignLibraryEntry(entry,targets){
 const db=readStudents(),ref=routeReference(entry);let added=0;
 for(const target of targets){
  const student=db.students[target.studentId];if(!student)throw Error('Alumno no encontrado.');
  let destination=student;
  if(target.classId){destination=student.permits[target.permit]?.history.find(c=>c.id===target.classId);if(!destination)throw Error('Clase no encontrada.');}
  destination.rutas||=[];if(!destination.rutas.some(r=>usesEntry(r,entry))){destination.rutas.push(ref);destination.updatedAt=student.updatedAt=new Date().toISOString();added++;}
 }
 writeStudents(db);return added;
}
