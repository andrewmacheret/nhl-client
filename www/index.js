'use strict';

(function() {
  var apiUrl = 'https://nhl.andrewmacheret.com';
  var calendarUrl = 'webcal://nhl.andrewmacheret.com/calendar';

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

  var pageUrl = function(team, date) {
    return '?team=' + encodeURIComponent(team) + '&date=' + encodeURIComponent(date);
  };

  var loadSchedule = function(team, date) {
    var url = apiUrl + '/games' + pageUrl(team, date);
    fetch(url)
      .then(function(response) {
        // Errors come back as JSON too, like {"errorMessage": "team not found: 'nope'"}
        return response.json().catch(function() {
          return { errorMessage: 'Something went wrong (' + response.status + ')' };
        });
      })
      .catch(function() {
        return { errorMessage: 'Could not reach the NHL schedule. Try again in a minute.' };
      })
      .then(function(json) {
        render(team, date, json);
        // Keep live scores fresh
        var live = (json.games || []).some(function(game) { return game.state === 'live'; });
        if (live) {
          setTimeout(function() { loadSchedule(team, date); }, 60 * 1000);
        }
      });
  };

  var render = function(team, date, json) {
    var dayOfWeek = parseDate(date).toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' });
    var dateHtml = '<div class="date">' + escapeHtml(date) + ' (' + dayOfWeek + ')</div>';
    var backLink = '<a class="back-link" href="' + escapeHtml(pageUrl(team, addDays(date, -1))) + '">&lt;</a>';
    var nextLink = '<a class="next-link" href="' + escapeHtml(pageUrl(team, addDays(date, 1))) + '">&gt;</a>';

    var html = '<div class="date-section">' + backLink + dateHtml + nextLink + '</div>';

    var games = json.games;
    if (!games) {
      html += '<div class="no-games">' + escapeHtml(json.errorMessage || 'Something went wrong') + '</div>';
      html += '<div class="next-game"><a href="' + escapeHtml(pageUrl('sharks', date)) + '">Back to the Sharks</a></div>';
      document.getElementById('body-wrapper').innerHTML = html;
      return;
    }

    if (games.length == 0) {
      html += '<div class="no-games">(no games)</div>';
    } else {
      html += '<div class="schedule">';
      for (var i=0; i<games.length; i++) {
        html += gameHtml(games[i]);
      }
      html += '</div>';
    }

    var allDone = games.every(function(game) { return game.state === 'final' || game.state === 'cancelled'; });
    if (json.next && allDone) {
      html += nextGameHtml(json.team.id, json.next);
    }

    html += footerHtml(json.team, json.teams, date);

    document.getElementById('body-wrapper').innerHTML = html;

    document.getElementById('team-picker').addEventListener('change', function(event) {
      document.location.search = pageUrl(event.target.value, date);
    });
  };

  function gameHtml(item) {
    var team1 = (item.isHome ? item.home : item.away);
    var team2 = (item.isHome ? item.away : item.home);

    var logo1 = logoHtml(team1);
    var vsOrAt = '<div class="vs-or-at">' + (item.isHome ? 'vs' : 'at') + '</div>';
    var logo2 = logoHtml(team2);

    var channels = '<div class="channels">' + escapeHtml(item.broadcasts.join(', ')) + '</div>';

    return '<div class="item">' + logo1 + vsOrAt + logo2 + statusHtml(item) + channels + '</div>';
  }

  // The start time before the game, then the score with my team's goals first
  function statusHtml(item) {
    if (item.state === 'postponed' || item.state === 'cancelled') {
      return '<div class="time">' + (item.state === 'postponed' ? 'Postponed' : 'Cancelled') + '</div>';
    }
    if (!item.score) {
      return '<div class="time">' + formatTime(item.gameDate) + '</div>';
    }

    var mine = item.isHome ? item.score.home : item.score.away;
    var theirs = item.isHome ? item.score.away : item.score.home;
    if (item.state === 'live') {
      return '<div class="score">' + mine + ' &ndash; ' + theirs + '</div>' +
        '<div class="time live">LIVE &middot; ' + escapeHtml(item.period || '') + '</div>';
    }
    var result = mine > theirs ? 'W' : 'L';
    var overtime = item.endedIn && item.endedIn !== 'REG' ? '/' + item.endedIn : '';
    return '<div class="score ' + (result === 'W' ? 'win' : 'loss') + '">' + result + ' ' + mine + ' &ndash; ' + theirs + '</div>' +
      '<div class="time final">Final' + escapeHtml(overtime) + '</div>';
  }

  function nextGameHtml(team, next) {
    var opponent = next.isHome ? next.away : next.home;
    var when = parseDate(next.date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });
    if (next.state === 'upcoming') {
      when += ', ' + formatTime(next.gameDate);
    }
    return '<div class="next-game">Next game: <a href="' + escapeHtml(pageUrl(team, next.date)) + '">' +
      escapeHtml(when) + ' ' + (next.isHome ? 'vs' : 'at') + ' ' + escapeHtml(opponent.shortName) + '</a></div>';
  }

  function footerHtml(team, teams, date) {
    var options = teams.map(function(t) {
      return '<option value="' + escapeHtml(t.id) + '"' + (t.id === team.id ? ' selected' : '') + '>' + escapeHtml(t.name) + '</option>';
    }).join('');
    var record = [team.record, team.streak].filter(Boolean).map(escapeHtml).join(' &middot; ');

    var feed = calendarUrl + '?team=' + encodeURIComponent(team.id);
    var googleUrl = 'https://calendar.google.com/calendar/r?cid=' + encodeURIComponent(feed);

    return '<div class="footer">' +
      '<select id="team-picker" aria-label="Team">' + options + '</select>' +
      (record ? ' <span class="record">' + record + '</span>' : '') +
      '<div class="calendar">Add to calendar: ' +
        '<a href="' + escapeHtml(feed) + '">Apple</a> &middot; ' +
        '<a href="' + escapeHtml(googleUrl) + '" target="_blank" rel="noopener">Google</a>' +
      '</div>' +
      '</div>';
  }

  // Like "7:00 PM PST"
  function formatTime(isoDate) {
    return new Date(Date.parse(isoDate)).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', timeZoneName: 'short' });
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

  var query = getQueryObject();

  if (!query.team) {
    query.team = 'sharks'; // go sharks!
  }
  if (!query.date) {
    query.date = newLocalDate();
  }
  window.history.replaceState({}, null, pageUrl(query.team, query.date));

  loadSchedule(query.team, query.date);
})();
