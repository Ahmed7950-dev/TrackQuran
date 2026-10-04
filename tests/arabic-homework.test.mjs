import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';

const calls = [], responses = [], notices = [];
globalThis.window = { location: { origin: 'https://example.test' } };
globalThis.__homeworkDb = { from(table) {
  const call = { table, filters: [] };
  const q = { then(resolve, reject) { calls.push(call); return Promise.resolve(responses.shift() ?? { data: null, error: null }).then(resolve, reject); } };
  for (const method of ['select','insert','update','eq','order','range','maybeSingle','single','in','neq','gte']) q[method] = (...args) => {
    if (method === 'eq') call.filters.push(args); else call[method] = args[0]; return q;
  };
  return q;
} };
globalThis.__homeworkNotify = input => { notices.push(input); };
globalThis.__homeworkLessons = [];
const compiled = await build({ entryPoints: ['services/arabicHomeworkService.ts'], bundle: true, write: false, format: 'esm', platform: 'node', plugins: [{
  name: 'homework-service-fixtures', setup(b) {
    b.onResolve({ filter: /lib\/supabase$/ }, () => ({ path: 'db', namespace: 'fixture' }));
    b.onResolve({ filter: /notificationService$/ }, () => ({ path: 'notifications', namespace: 'fixture' }));
    b.onResolve({ filter: /lessonSessionService$/ }, () => ({ path: 'lessons', namespace: 'fixture' }));
    b.onResolve({ filter: /\/arabicService$/ }, () => ({ path: 'arabic', namespace: 'fixture' }));
    b.onLoad({ filter: /.*/, namespace: 'fixture' }, ({path}) => ({ contents: {
      db: 'export const supabase = globalThis.__homeworkDb;',
      notifications: 'export const createNotification = async input => globalThis.__homeworkNotify(input);',
      lessons: 'export const getStudentUnifiedLessons = async () => globalThis.__homeworkLessons;',
      arabic: 'export const ensureShareTokenById = async () => "student-portal-token";',
    }[path] }));
  }
}] });
const service = await import(`data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].text).toString('base64')}`);
const engineBuild = await build({ entryPoints: ['services/letterCardsEngine.ts'], bundle: true, write: false, format: 'esm', platform: 'node' });
const engine = await import(`data:text/javascript;base64,${Buffer.from(engineBuild.outputFiles[0].text).toString('base64')}`);
const row = { id:'hw', teacher_id:'teacher', student_id:'student', student_name:'Sample', kind:'lesson', title:'My family', status:'assigned', words:[], deadline:null, lesson_id:'lesson', assigned_at:'2026-01-01', created_at:'2026-01-01' };
beforeEach(() => { calls.length=0; responses.length=0; notices.length=0; globalThis.__homeworkLessons=[]; });

test('status prioritizes explicit results over deadlines', () => {
  const past = '2020-01-01', future = '2099-01-01';
  for (const [status, deadline, expected] of [ ['assigned',null,'With student'],['assigned',future,'With student'],['assigned',past,'Wasn’t done'],['completed',past,'Done'],['cancelled',past,'Cancelled'],['missed',null,'Wasn’t done'] ]) {
    assert.equal(service.homeworkStatus({status,deadline}),expected);
  }
});

async function assignLesson(lessons) {
  globalThis.__homeworkLessons=lessons;
  responses.push({data:{name:'Sample',share_token:'student-portal-token'}}, {data:{title:'My family'}}, {count:3},
    {data:{id:'hw'}}, {data:row}, {data:{share_token:'student-portal-token'}});
  await service.assignCompletedLessonHomework('teacher','student','lesson');
  return calls.find(c=>c.insert)?.insert;
}
test('completing a lesson assigns homework until the earliest future calendar lesson', async () => {
  const assigned=await assignLesson([{startAt:'2099-03-03T17:00:00Z'},{startAt:'2020-01-01'},{startAt:'2099-03-02T17:00:00Z'}]);
  assert.equal(assigned.deadline,'2099-03-02T17:00:00.000Z');
  assert.equal(assigned.kind,'lesson'); assert.equal(assigned.lesson_id,'lesson');
  assert.equal(notices.length,1); assert.equal(notices[0].studentId,'student-portal-token');
  assert.equal(notices[0].metadata.url,'https://example.test/vocab-homework/hw');
});
test('no scheduled lesson leaves homework open-ended', async () => {
  assert.equal((await assignLesson([])).deadline,null);
});
test('a lesson with no homework content creates no assignment', async () => {
  responses.push({data:{name:'Sample',share_token:'token'}},{data:{title:'Intro'}},{count:0});
  await service.assignCompletedLessonHomework('teacher','student','lesson');
  assert.equal(calls.filter(c=>c.insert).length,0); assert.equal(notices.length,0);
});
test('repeated lesson completion reuses the assignment and does not notify twice', async () => {
  responses.push({error:{code:'23505'}},{data:{id:'hw'}},{data:row});
  const result=await service.createArabicHomework({teacherId:'teacher',studentId:'student',studentName:'Sample',kind:'lesson',title:'My family',lessonId:'lesson',deadline:null});
  assert.equal(result.id,'hw'); assert.equal(notices.length,0);
});
test('tutor cancellation uses the current status and notifies the Arabic portal identity', async () => {
  responses.push({data:{id:'hw'}},{data:{share_token:'token'}});
  await service.setArabicHomeworkStatus({id:'hw',teacherId:'teacher',studentId:'student',title:'Flashcards',status:'assigned',deadline:null},'cancelled');
  assert.deepEqual(calls[0].filters,[['id','hw'],['status','assigned']]);
  assert.equal(calls[0].update.status,'cancelled'); assert.equal(notices[0].studentId,'token');
  assert.match(notices[0].body,/Cancelled/);
});
test('failed status writes surface an error and send no notification', async () => {
  responses.push({error:{message:'Connection lost'}});
  await assert.rejects(service.setArabicHomeworkStatus({id:'hw',status:'assigned'},'completed'),/Connection lost/);
  assert.equal(notices.length,0);
});
test('word-card state survives leaving between a throw and its judgment', () => {
  const initial=engine.deal(['one','two','three'],'initial',3,'solo');
  const thrown=engine.throwTutor(initial,0);
  const answered=engine.throwStudent(thrown,thrown.studentHand.findIndex(c=>c.letter===thrown.thrownTutor.letter));
  const restored=JSON.parse(JSON.stringify(answered));
  assert.deepEqual(restored,answered);
  const next=engine.judge(restored);
  assert.equal(next.score,1); assert.equal(next.flash.n,1); assert.equal(next.lives,3);
  assert.equal(next.total,3); assert.equal(next.thrownStudent,null);
});
test('resuming a wrong word-card answer preserves mistakes and remaining lives', () => {
  const thrown=engine.throwTutor(engine.deal(['one','two','three'],'initial',3,'solo'),0);
  const answered=engine.throwStudent(thrown,thrown.studentHand.findIndex(c=>c.letter!==thrown.thrownTutor.letter));
  const next=engine.judge(JSON.parse(JSON.stringify(answered)));
  assert.equal(next.mistakes,1); assert.equal(next.lives,2); assert.equal(next.flash.ok,false);
  assert.equal(next.wrongLetters[thrown.thrownTutor.letter],1);
});

const remindersBuild = await build({ entryPoints: ['supabase/functions/_shared/openHomework.ts'], bundle: true, write: false, format: 'esm', platform: 'node' });
const reminders = await import(`data:text/javascript;base64,${Buffer.from(remindersBuild.outputFiles[0].text).toString('base64')}`);
test('reminders use active assignments, exclude overdue work, and never recreate cancelled lesson homework', async () => {
  responses.push({data:[
    {student_id:'student',kind:'flashcards',words:[{},{}],deadline:'2020-01-01'},
    {student_id:'student',kind:'lesson',title:'At school',words:[],deadline:null},
    {student_id:'student',kind:'word_cards',words:[{},{}],deadline:null},
  ]},{data:[]});
  const { homeworkFor }=await reminders.loadOpenHomework(globalThis.__homeworkDb,['student'],'2020-01-01',new Map(),new Map([['student',{id:'student',completed_lesson_ids:['cancelled-lesson']}]]));
  assert.deepEqual(homeworkFor('student').items,['the homework for "At school"','your word cards (2 words)']);
  assert.equal(calls.some(c=>c.table==='arabic_lesson_homework'),false);
  assert.ok(calls.find(c=>c.table==='arabic_vocab_homework').filters.some(([key,value])=>key==='status'&&value==='assigned'));
});
