import { lazy, Suspense } from 'react';
import { ArrowRightIcon, BookOpenIcon, CalendarDaysIcon, FireIcon, SparklesIcon, RectangleStackIcon, BoltIcon } from '@heroicons/react/24/outline';
import Logo3D from './Logo3D';
import { HOME_COPY, STREAK_COPY } from '../homeContent';

const LandingExtras = lazy(() => import('./LandingExtras'));

export function HeroCard({ user, documentCount = 0, average = 0, streak = {}, go, openAuth, randomQuote, notify }) {
  return (
    <section className={`hero-section ${!user ? 'landing-hero' : ''}`} aria-labelledby="home-title">
      <div className="hero-copy">
        <span className="eyebrow">
          {HOME_COPY.eyebrow}
        </span>
        <h1 id="home-title">
          {HOME_COPY.headline[0]}
          <br />
          <span>{HOME_COPY.headline[1]}</span>
        </h1>
        <p className="hero-tagline">
          {HOME_COPY.description}
        </p>
        <div className="hero-actions">
          <button
            className="btn btn-primary large"
            onClick={() => user ? go("tutor") : openAuth("login")}
          >
            <SparklesIcon aria-hidden="true" className="btn-icon" />
            {HOME_COPY.askNova}
          </button>
          <button
            className="btn btn-outline large"
            onClick={() => user ? go("library") : openAuth("login")}
          >
            <BookOpenIcon aria-hidden="true" className="btn-icon" />
            {HOME_COPY.openLibrary}
          </button>
        </div>
        <div className="hero-badges">
          <button type="button" className="hero-badge" onClick={() => go("quiz")}><RectangleStackIcon aria-hidden="true" /> {HOME_COPY.chips[0]}</button>
          <button type="button" className="hero-badge" onClick={() => go("roadmap")}><SparklesIcon aria-hidden="true" /> {HOME_COPY.chips[1]}</button>
          <button type="button" className="hero-badge" onClick={() => go("dashboard")}><BoltIcon aria-hidden="true" /> {HOME_COPY.chips[2]}</button>
        </div>
      </div>
      <div className="hero-visual">
        <Logo3D {...randomQuote} onNotify={notify} />
        {user ? <>
          <div className="hero-note hero-note--one"><BookOpenIcon aria-hidden="true" /><div><strong>{documentCount} {HOME_COPY.documentUnit}</strong><small>{HOME_COPY.stats[0]}</small></div></div>
          <div className="hero-note hero-note--two"><SparklesIcon aria-hidden="true" /><div><strong>{`${average}%`}</strong><small>{HOME_COPY.stats[1]}</small></div></div>
          <div className="hero-note hero-note--three">{streak.current_streak > 0 ? <FireIcon aria-hidden="true" /> : <CalendarDaysIcon aria-hidden="true" />}<div><strong>{streak.current_streak || 0} {HOME_COPY.dayUnit}</strong><small>{HOME_COPY.stats[2]}</small></div></div>
        </> : <>
          <div className="hero-note hero-note--one"><BookOpenIcon aria-hidden="true" /><div><strong>{HOME_COPY.guestStats[0][0]}</strong><small>{HOME_COPY.guestStats[0][1]}</small></div></div>
          <div className="hero-note hero-note--two"><SparklesIcon aria-hidden="true" /><div><strong>{HOME_COPY.guestStats[1][0]}</strong><small>{HOME_COPY.guestStats[1][1]}</small></div></div>
          <div className="hero-note hero-note--three"><CalendarDaysIcon aria-hidden="true" /><div><strong>{HOME_COPY.guestStats[2][0]}</strong><small>{HOME_COPY.guestStats[2][1]}</small></div></div>
        </>}
      </div>
    </section>
  );
}

function StreakCard({ user, streak }) {
  const timeZone = user.timezone || 'Asia/Ho_Chi_Minh';
  let dateFormat;
  try { dateFormat = new Intl.DateTimeFormat('sv-SE', { timeZone }); }
  catch { dateFormat = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Ho_Chi_Minh' }); }
  const today = user.timezone ? dateFormat.format(new Date()) : streak.today || dateFormat.format(new Date());
  const start = new Date(today + 'T12:00:00Z');
  start.setUTCDate(start.getUTCDate() - start.getUTCDay());
  const activity = new Set(streak.activity_dates || []);
  const todayActive = activity.has(today);
  const weekdays = ['CN', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7'];
  const fullDate = new Intl.DateTimeFormat('vi-VN', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long' });
  const timezoneLabel = user.timezone
    ? new Intl.DateTimeFormat('vi-VN', { timeZone: dateFormat.resolvedOptions().timeZone, timeZoneName: 'shortOffset' }).formatToParts(new Date()).find(part => part.type === 'timeZoneName')?.value
    : streak.timezone || STREAK_COPY.timezone;
  return <article className="streak-card" aria-labelledby="streak-title">
    <div className="streak-card-heading">
      <div className={`streak-symbol fire-level-${Math.min(streak.current_streak || 0, 3)}`} aria-hidden="true">{streak.current_streak > 0 ? <FireIcon /> : <CalendarDaysIcon />}</div>
      <div className="streak-title-group"><span className="eyebrow">{STREAK_COPY.eyebrow}</span><h3 id="streak-title">Chuỗi học hiện tại</h3></div>
      <div className="streak-total"><strong>{streak.current_streak || 0}</strong><span>{STREAK_COPY.dayUnit}</span></div>
    </div>
    <p className="streak-description">{todayActive ? STREAK_COPY.active : STREAK_COPY.inactive}</p>
    <div className="streak-week" role="list" aria-label="Hoạt động học tập tuần này">
      {weekdays.map((label, index) => {
        const date = new Date(start);
        date.setUTCDate(start.getUTCDate() + index);
        const key = date.toISOString().slice(0, 10);
        const active = activity.has(key);
        const isToday = key === today;
        return <div className={`streak-day${active ? ' is-active' : ''}${isToday ? ' today' : ''}`} role="listitem" aria-label={`${fullDate.format(date)}, ${active ? 'đã học' : 'chưa học'}`} aria-current={isToday ? 'date' : undefined} key={key}>
          <span>{label}</span><strong>{date.getUTCDate()}</strong><i aria-hidden="true">{active ? '✓' : '·'}</i>{isToday && <span className="day-today">{HOME_COPY.today}</span>}
        </div>;
      })}
    </div>
    <footer className="streak-card-footer"><span><CalendarDaysIcon aria-hidden="true" />{STREAK_COPY.today} {todayActive ? STREAK_COPY.recorded : STREAK_COPY.unrecorded}</span><span>{STREAK_COPY.rule}</span><span>{timezoneLabel}</span></footer>
  </article>;
}

export function StreakSection({ user, streak = {} }) {
  return <section className="content-section streak-habit-section" aria-labelledby="habit-title">
    <span className="eyebrow">{HOME_COPY.habitEyebrow}</span>
    <h2 id="habit-title">{HOME_COPY.habitTitle}</h2>
    <p>{HOME_COPY.habitDescription}</p>
    {user ? <StreakCard user={user} streak={streak} /> : <div className="streak-calendar-card">
      <div className="streak-cal-header">
        <span>{HOME_COPY.calendarExample}</span>
        <span>✔ {HOME_COPY.calendarCaption}</span>
      </div>
      <div className="streak-week">
        {HOME_COPY.weekdays.map((day, i) => (
          <div className={`streak-day${i < 5 ? ' done' : ''}${i === new Date().getDay() - 1 ? ' today' : ''}`} key={i}>
            <span className="day-label">{day}</span>
            <span className="day-num">{12 + i}</span>
            {i < 5 && <span className="day-check">✔</span>}
          </div>
        ))}
      </div>
    </div>}
  </section>;
}

export function MemberHome(props) {
  return <div className="home-page home-page--member"><HeroCard {...props} /><StreakSection user={props.user} streak={props.streak} /></div>;
}

export function GuestHome({ go, openAuth, randomQuote, notify, plans }) {
  return <div className="home-page home-page--guest">
    <HeroCard go={go} openAuth={openAuth} randomQuote={randomQuote} notify={notify} />
    <section className="content-section pain-points-section" aria-labelledby="pain-title">
      <span className="eyebrow">{HOME_COPY.painEyebrow}</span>
      <h2 id="pain-title">{HOME_COPY.painTitle}</h2>
      <div className="pain-grid">
        {HOME_COPY.painPoints.map(([icon, title, desc], i) => (
          <article className="pain-card" key={i}>
            <span className="pain-icon">{icon}</span>
            <h3>{title}</h3>
            <p>{desc}</p>
          </article>
        ))}
      </div>
      <p className="pain-conclusion">
        <strong>{HOME_COPY.painConclusion[0]}</strong><br/>
        {HOME_COPY.painConclusion[1]}
      </p>
    </section>
    <section className="content-section workflow-section" aria-labelledby="workflow-title" id="studyhub-workflow">
      <span className="eyebrow">{HOME_COPY.workflowEyebrow}</span>
      <h2 id="workflow-title">{HOME_COPY.workflowTitle[0]}<br />{HOME_COPY.workflowTitle[1]}</h2>
      <div className="workflow-grid reveal-stagger">
        {HOME_COPY.workflow.map(([num, title, detail, target]) => (
          <article className="workflow-card" key={num}>
            <span className="step-tag">{num}</span>
            <h3>{title}</h3>
            <p>{detail}</p>
            <button className="text-link" onClick={() => go(target)}>
              {HOME_COPY.openFeature}{" "}
              <ArrowRightIcon
                aria-hidden="true"
                className="link-icon"
              />
            </button>
          </article>
        ))}
      </div>
    </section>
    <section className="content-section roadmap-sample-section" aria-labelledby="sample-title">
      <span className="eyebrow">{HOME_COPY.roadmapEyebrow}</span>
      <h2 id="sample-title">{HOME_COPY.roadmapTitle}</h2>
      <p>{HOME_COPY.roadmapDescription}</p>
      <div className="roadmap-cards">
        {HOME_COPY.roadmapWeeks.map((w, i) => (
          <article className={`roadmap-week-card${w.active ? ' active' : ''}`} key={i}>
            <div className="roadmap-week-header">
              <span className="week-dot" />
              <span className="week-label">{w.week}</span>
              {w.active && <span className="week-badge">{HOME_COPY.studying}</span>}
            </div>
            <h3>{w.title}</h3>
            <p className="week-sub">{w.sub}</p>
            <ul>{w.items.map((item, j) => <li key={j}>{item}</li>)}</ul>
            <div className="week-progress">
              <span>{HOME_COPY.progress}</span>
              <strong>{w.progress}%</strong>
            </div>
            <div className="progress-bar"><span style={{ width: `${w.progress}%` }} /></div>
          </article>
        ))}
      </div>
      <div className="roadmap-cta">
        <p><strong>{HOME_COPY.roadmapCtaTitle}</strong></p>
        <p>{HOME_COPY.roadmapCtaDescription}</p>
        <button className="btn btn-primary" onClick={() => go("roadmap")}>{HOME_COPY.roadmapCta}</button>
      </div>
    </section>
    <StreakSection />
    <Suspense fallback={null}><LandingExtras plans={plans} onStart={() => openAuth('register')} onExplore={go} /></Suspense>
  </div>;
}

export function HomeSkeleton() {
  return <main className="home-page home-page--member home-page--loading" aria-busy="true" role="status" aria-label="Đang kiểm tra phiên đăng nhập">
    <section className="hero-section" aria-labelledby="loading-hero-title">
      <span id="loading-hero-title" className="sr-only">Đang tải trang chủ</span>
      <div className="home-skeleton-copy" aria-hidden="true"><span /><span /><span /><span /></div><div className="home-skeleton-logo" aria-hidden="true" />
    </section>
    <section className="content-section streak-habit-section" aria-labelledby="loading-streak-title">
      <span id="loading-streak-title" className="sr-only">Đang tải nhịp học</span>
      <div className="home-skeleton-copy" aria-hidden="true"><span /><span /><span /></div>
      <div className="streak-week" aria-hidden="true">{Array.from({ length: 7 }, (_, index) => <div className="streak-day home-skeleton-day" key={index} />)}</div>
    </section>
  </main>;
}

