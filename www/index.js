'use strict';

(function() {
  var apiUrl = 'https://nhl.andrewmacheret.com';
  var calendarUrl = 'webcal://nhl.andrewmacheret.com/calendar';

  var icons = {
    left: '<svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true"><path d="M12.5 4.5 7 10l5.5 5.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    right: '<svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true"><path d="M7.5 4.5 13 10l-5.5 5.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    calendar: '<svg width="18" height="18" viewBox="0 0 20 20" aria-hidden="true"><rect x="3" y="4.5" width="14" height="12.5" rx="2.5" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M3 8.5h14M7 2.5v4M13 2.5v4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
    external: '<svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M4 2.5h5.5V8M9.5 2.5 3 9" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>'
  };

  var getQueryObject = function() {
    var query = {};
    var a = document.location.search.substr(1).split('&');
    for (var i = 0; i < a.length; i++) {
      var b = a[i].split('=');
      query[decodeURIComponent(b[0])] = decodeURIComponent(b[1] || '');
    }
    return query;
  };

  var newLocalDate = function() {
    return new Date()
      .toLocaleDateString("en-US", {year: 'numeric', month: '2-digit', day: '2-digit'})
      .replace(/^(..)\/(..)\/(....)$/, '$3-$1-$2');
  };

  // Noon UTC, so adding days never lands on the wrong date because of daylight saving time
  var parseDate = function(date) {
    return new Date(date + 'T12:00:00Z');
  };

  var addDays = function(date, days) {
    var dateObj = parseDate(date);
    dateObj.setUTCDate(dateObj.getUTCDate() + days);
    return dateObj.toISOString().substring(0, 10);
  };

  // Like "Sat, Nov 21", with the year only when it isn't this year
  var formatDay = function(date, weekday) {
    var options = { weekday: weekday || 'short', month: 'short', day: 'numeric', timeZone: 'UTC' };
    if (date.substring(0, 4) !== newLocalDate().substring(0, 4)) {
      options.year = 'numeric';
    }
    return parseDate(date).toLocaleDateString('en-US', options);
  };

  // Like { time: "7:00 PM", zone: "PST" }
  var formatTime = function(isoDate) {
    var parts = new Intl.DateTimeFormat([], { hour: 'numeric', minute: '2-digit', timeZoneName: 'short' })
      .formatToParts(new Date(Date.parse(isoDate)));
    var zone = '';
    var time = parts.map(function(part) {
      if (part.type === 'timeZoneName') {
        zone = part.value;
        return '';
      }
      return part.value;
    }).join('').trim();
    return { time: time, zone: zone };
  };

  var relativeDay = function(date) {
    var today = newLocalDate();
    if (date === today) return 'Today';
    if (date === addDays(today, 1)) return 'Tomorrow';
    if (date === addDays(today, -1)) return 'Yesterday';
    return '';
  };

  var pageUrl = function(team, date) {
    return '?team=' + encodeURIComponent(team) + '&date=' + encodeURIComponent(date);
  };

  // Responses by page URL, so days you've seen or that were fetched ahead show up right away
  var responses = {};

  var isLive = function(game) { return game.state === 'live'; };

  var fetchSchedule = function(team, date, fresh) {
    var key = pageUrl(team, date);
    var saved = responses[key];
    if (saved && !fresh && Date.now() - saved.time < saved.maxAgeMs) {
      return saved.json;
    }
    var json = fetch(apiUrl + '/games' + key)
      .then(function(response) {
        // Errors come back as JSON too, like {"errorMessage": "team not found: 'nope'"}
        return response.json().catch(function() {
          return { errorMessage: 'Something went wrong (' + response.status + ')' };
        });
      })
      .catch(function() {
        return { errorMessage: 'Could not reach the NHL schedule. Try again in a minute.' };
      })
      .then(function(result) {
        var entry = responses[key];
        if (entry && entry.json === json) {
          // Don't keep errors, so the next try asks again
          if (!result.games) delete responses[key];
          // Live scores go stale fast
          else if (result.games.some(isLive)) entry.maxAgeMs = 60 * 1000;
        }
        return result;
      });
    responses[key] = { time: Date.now(), json: json, maxAgeMs: 5 * 60 * 1000 };
    return json;
  };

  // The days next to this one, one at a time so a cold API only starts one copy of itself
  var fetchAhead = function(team, date, json) {
    var dates = [addDays(date, 1), addDays(date, -1)];
    if (json.next) dates.push(json.next.date);
    dates.reduce(function(previous, day) {
      return previous.then(function() { return fetchSchedule(team, day); });
    }, Promise.resolve());
  };

  var liveTimer = null;
  var shown = null;

  var loadSchedule = function(team, date, fresh) {
    var key = pageUrl(team, date);
    shown = key;
    clearTimeout(liveTimer);
    var wrapper = document.getElementById('body-wrapper');
    var json = fetchSchedule(team, date, fresh);
    // Fade the old day only if the new one takes a moment, so quick loads don't flicker
    var fadeTimer = setTimeout(function() { wrapper.classList.add('is-loading'); }, 150);
    json.then(function(json) {
      // A newer click won the race
      if (shown !== key) return;
      clearTimeout(fadeTimer);
      wrapper.classList.remove('is-loading');
      render(team, date, json);
      if (!json.games) return;
      // Keep live scores fresh
      if (json.games.some(isLive)) {
        liveTimer = setTimeout(function() { loadSchedule(team, date, true); }, 60 * 1000);
      }
      fetchAhead(team, date, json);
    });
  };

  // Moves to another team or day without reloading the page
  var go = function(team, date) {
    query.team = team;
    query.date = date;
    window.history.pushState({}, '', pageUrl(team, date));
    // Links like "Up next" sit below the fold, so bring the date back into view
    var wrapper = document.getElementById('body-wrapper');
    if (wrapper.getBoundingClientRect().top < 0) {
      wrapper.scrollIntoView();
    }
    loadSchedule(team, date);
  };

  var render = function(team, date, json) {
    var html = dateNavHtml(team, date);
    var games = json.games;

    if (!games) {
      html += '<section class="stage stage-empty">' +
        '<h2>Couldn&rsquo;t load the schedule</h2>' +
        '<p>' + escapeHtml(json.errorMessage || 'Something went wrong') + '</p>' +
        '<a class="control" href="' + escapeHtml(pageUrl('sharks', date)) + '">Back to the Sharks</a>' +
        '</section>';
      document.getElementById('body-wrapper').innerHTML = html;
      return;
    }

    var teamId = json.team.id;
    if (games.length == 0) {
      html += noGamesHtml(json.team, json.next, date);
    } else {
      html += games.map(gameHtml).join('');
      var allDone = games.every(function(game) { return game.state === 'final' || game.state === 'cancelled'; });
      if (json.next && allDone) {
        html += '<h2 class="section-head">Up next</h2>' + nextCardHtml(teamId, json.next);
      }
    }
    html += seasonHtml(json.team, date);
    html += calendarHtml(json.team);

    document.getElementById('body-wrapper').innerHTML = html;
    document.getElementById('team-slot').innerHTML = teamPickerHtml(json.team, json.teams);
    document.getElementById('team-picker').addEventListener('change', function(event) {
      go(event.target.value, date);
    });
    document.title = json.team.name + ' · NHL Today';
  };

  function dateNavHtml(team, date) {
    var today = newLocalDate();
    var sub = [escapeHtml(relativeDay(date))];
    if (date !== today) {
      sub.push('<a href="' + escapeHtml(pageUrl(team, today)) + '">Jump to today</a>');
    }
    return '<nav class="date-nav" aria-label="Day">' +
      '<a class="control round" href="' + escapeHtml(pageUrl(team, addDays(date, -1))) + '" aria-label="Previous day">' + icons.left + '</a>' +
      '<div class="date-label">' +
        '<div class="date-main">' + escapeHtml(formatDay(date, 'long')) + '</div>' +
        '<div class="date-sub">' + sub.filter(Boolean).join(' &middot; ') + '</div>' +
      '</div>' +
      '<a class="control round" href="' + escapeHtml(pageUrl(team, addDays(date, 1))) + '" aria-label="Next day">' + icons.right + '</a>' +
      '</nav>';
  }

  function gameHtml(item) {
    var mine = item.isHome ? item.home : item.away;
    var theirs = item.isHome ? item.away : item.home;
    var vsOrAt = item.isHome ? 'vs' : 'at';

    var tone = '';
    var chip = '<span class="chip">' + (item.isHome ? 'Home' : 'Away') + '</span>';
    var middle;

    if (item.state === 'postponed' || item.state === 'cancelled') {
      chip = '<span class="chip warn">' + (item.state === 'postponed' ? 'Postponed' : 'Cancelled') + '</span>';
      middle = '<div class="vs">' + vsOrAt + '</div>';
    } else if (!item.score) {
      var start = formatTime(item.gameDate);
      middle = '<div class="vs">' + vsOrAt + '</div>' +
        '<div class="start">' + escapeHtml(start.time) + '</div>' +
        '<div class="zone">' + escapeHtml(start.zone) + '</div>';
    } else {
      // My team's goals go first, on the same side as my team's logo
      var myGoals = item.isHome ? item.score.home : item.score.away;
      var theirGoals = item.isHome ? item.score.away : item.score.home;
      var ahead = myGoals > theirGoals;
      var behind = myGoals < theirGoals;
      middle = '<div class="vs">' + vsOrAt + '</div>' +
        '<div class="score" aria-label="' + myGoals + ' to ' + theirGoals + '">' +
          '<span class="' + (behind ? 'behind' : '') + '">' + myGoals + '</span>' +
          '<span class="dash" aria-hidden="true">&ndash;</span>' +
          '<span class="' + (ahead ? 'behind' : '') + '">' + theirGoals + '</span>' +
        '</div>';

      if (item.state === 'live') {
        tone = 'stage-live';
        chip = '<span class="chip bad live"><span class="live-dot"></span>Live &middot; ' + escapeHtml(item.period || '') + '</span>';
      } else {
        var overtime = item.endedIn && item.endedIn !== 'REG' ? ' &middot; ' + escapeHtml(item.endedIn) : '';
        tone = ahead ? 'stage-win' : 'stage-lose';
        chip = '<span class="chip ' + (ahead ? 'good' : 'warn') + '">' + (ahead ? 'Win' : 'Loss') + overtime + '</span>';
      }
    }

    var details = [];
    if (item.venue) {
      details.push('<span class="venue">' + escapeHtml(item.venue) + '</span>');
    }
    item.broadcasts.forEach(function(network) {
      details.push('<span class="tv" title="TV">' + escapeHtml(network) + '</span>');
    });
    if (item.gameCenterUrl) {
      details.push('<a href="' + escapeHtml(item.gameCenterUrl) + '" target="_blank" rel="noopener">Game Center' + icons.external + '</a>');
    }

    return '<section class="stage ' + tone + '" aria-label="' + escapeHtml(item.title) + '">' +
      '<div class="status-row">' + chip + '</div>' +
      '<div class="matchup">' + teamHtml(mine) + '<div class="middle">' + middle + '</div>' + teamHtml(theirs) + '</div>' +
      (details.length ? '<div class="details">' + details.join('') + '</div>' : '') +
      '</section>';
  }

  function teamHtml(team) {
    var place = team.name.substring(0, team.name.length - team.shortName.length).trim();
    return '<div class="team">' + logoHtml(team) +
      '<div class="team-name">' + escapeHtml(team.shortName) + '</div>' +
      '<div class="team-place">' + escapeHtml(place) + '</div>' +
      '</div>';
  }

  function nextGameText(next) {
    var opponent = next.isHome ? next.away : next.home;
    var when = formatDay(next.date);
    if (next.state === 'upcoming') {
      var start = formatTime(next.gameDate);
      when += ' at ' + start.time + ' ' + start.zone;
    }
    return { title: (next.isHome ? 'vs ' : 'at ') + opponent.shortName, when: when, opponent: opponent };
  }

  function noGamesHtml(team, next, date) {
    var day = relativeDay(date);
    var title = day === 'Today' || day === 'Tomorrow' ? 'No game ' + day.toLowerCase() : 'No game on ' + formatDay(date);
    var html = '<section class="stage stage-empty"><h2>' + escapeHtml(title) + '</h2>';
    if (next) {
      var text = nextGameText(next);
      html += '<p>Next up: ' + escapeHtml(text.when) + ' ' + escapeHtml(text.title) + '.</p>' +
        '<a class="control primary" href="' + escapeHtml(pageUrl(team.id, next.date)) + '">See the next game' + icons.right + '</a>';
    } else {
      html += '<p>Nothing else is on the schedule yet.</p>';
    }
    return html + '</section>';
  }

  function nextCardHtml(teamId, next) {
    var text = nextGameText(next);
    return '<a class="card next-card" href="' + escapeHtml(pageUrl(teamId, next.date)) + '">' +
      logoHtml(text.opponent) +
      '<div class="next-text">' +
        '<div class="next-title">' + escapeHtml(text.title) + '</div>' +
        '<div class="next-when">' + escapeHtml(text.when) + '</div>' +
      '</div>' +
      icons.right +
      '</a>';
  }

  // "W5" -> "5 wins in a row"
  function streakText(streak) {
    var match = /^(W|L|OT)(\d+)$/.exec(streak || '');
    if (!match) return '';
    var count = Number(match[2]);
    var word = { W: 'win', L: 'loss', OT: 'OT loss' }[match[1]];
    var plural = count === 1 ? word : (word.slice(-1) === 's' ? word + 'es' : word + 's');
    return count + ' ' + plural + ' in a row';
  }

  function seasonHtml(team, date) {
    if (!team.record) return '';
    var heading = date < newLocalDate() ? 'Season as of ' + formatDay(date) : 'This season';
    var stats = [
      ['Record', team.record, 'Wins, losses, OT'],
      ['Points', team.points, '2 per win, 1 per OT loss'],
      ['Streak', team.streak || '–', streakText(team.streak)]
    ];
    return '<h2 class="section-head">' + escapeHtml(heading) + '</h2>' +
      '<div class="stat-cards">' + stats.map(function(stat) {
        return '<div class="card stat-card">' +
          '<h3>' + stat[0] + '</h3>' +
          '<div class="stat-value">' + escapeHtml(stat[1]) + '</div>' +
          '<div class="stat-note">' + escapeHtml(stat[2]) + '</div>' +
          '</div>';
      }).join('') + '</div>';
  }

  function calendarHtml(team) {
    var feed = calendarUrl + '?team=' + encodeURIComponent(team.id);
    var googleUrl = 'https://calendar.google.com/calendar/r?cid=' + encodeURIComponent(feed);
    return '<h2 class="section-head">Never miss a game</h2>' +
      '<p class="calendar-text">Add every ' + escapeHtml(team.name) + ' game to your calendar. It updates on its own.</p>' +
      '<div class="dock">' +
        '<a class="control" href="' + escapeHtml(feed) + '">' + icons.calendar + 'Apple Calendar</a>' +
        '<a class="control" href="' + escapeHtml(googleUrl) + '" target="_blank" rel="noopener">' + icons.calendar + 'Google Calendar</a>' +
      '</div>';
  }

  function teamPickerHtml(team, teams) {
    var options = teams.map(function(t) {
      return '<option value="' + escapeHtml(t.id) + '"' + (t.id === team.id ? ' selected' : '') + '>' + escapeHtml(t.name) + '</option>';
    }).join('');
    return '<div class="team-picker"><select id="team-picker" class="select" aria-label="Team">' + options + '</select></div>';
  }

  function logoHtml(team) {
    var darkSource = team.darkLogo ? '<source srcset="' + escapeHtml(team.darkLogo) + '" media="(prefers-color-scheme: dark)">' : '';
    return '<picture class="logo">' + darkSource +
      '<img src="' + escapeHtml(team.logo) + '" alt="' + escapeHtml(team.name) + '" title="' + escapeHtml(team.name) + '">' +
      '</picture>';
  }

  function escapeHtml(unsafe) {
    return (unsafe + '')
         .replace(/&/g, "&amp;")
         .replace(/</g, "&lt;")
         .replace(/>/g, "&gt;")
         .replace(/"/g, "&quot;")
         .replace(/'/g, "&#039;");
 }

  var readQuery = function() {
    var query = getQueryObject();
    if (!query.team) {
      query.team = 'sharks'; // go sharks!
    }
    if (!query.date) {
      query.date = newLocalDate();
    }
    return query;
  };

  var query = readQuery();
  window.history.replaceState({}, '', pageUrl(query.team, query.date));

  // Left and right arrow keys move a day back or forward
  document.addEventListener('keydown', function(event) {
    if (event.altKey || event.ctrlKey || event.metaKey || event.target.tagName === 'SELECT') return;
    var days = { ArrowLeft: -1, ArrowRight: 1 }[event.key];
    if (days) {
      go(query.team, addDays(query.date, days));
    }
  });

  // Links to other days, like the arrows and "Jump to today", skip the page reload.
  // Cmd-click and middle-click still open a new tab
  document.addEventListener('click', function(event) {
    var link = event.target.closest('a[href^="?"]');
    if (!link || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    var params = new URLSearchParams(link.getAttribute('href'));
    event.preventDefault();
    go(params.get('team'), params.get('date'));
  });

  // The back and forward buttons
  window.addEventListener('popstate', function() {
    query = readQuery();
    loadSchedule(query.team, query.date);
  });

  loadSchedule(query.team, query.date);
})();
