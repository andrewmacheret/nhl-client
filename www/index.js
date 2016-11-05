'use strict';

$(function() {

  var daysOfWeek = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

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

  var loadSchedule = function(team, date) {
    var url = 'https://nhl.andrewmacheret.com/schedule/' + team + '/' + date;
    $.getJSON(url, function(json) {

      var dateObj = new Date(Date.parse(date));
      var dayOfWeek = daysOfWeek[dateObj.getUTCDay()];

      var dateHtml = '<div class="date">' + date + ' (' + dayOfWeek + ')</div>';

      dateObj.setDate(dateObj.getDate() - 1);
      dateObj.setHours(dateObj.getHours() + 2); // hack to work with DST
      var dateMinus1 = dateObj.toISOString().substring(0, 10);
      var backLink = '<a class="back-link" href="?team=' + team + '&date=' + dateMinus1 + '">&lt;</a>';
      dateObj.setDate(dateObj.getDate() + 2);
      var datePlus1 = dateObj.toISOString().substring(0, 10);
      var nextLink = '<a class="next-link" href="?team=' + team + '&date=' + datePlus1 + '">&gt;</a>';

      var html = '<div class="date-section">' + backLink + dateHtml + nextLink + '</div>';

      var schedule = json.schedule;
      if (schedule.length == 0) {
        html += '<div class="no-games">(no games)</div>'
      } else {
        html += '<div class="schedule">';
        for (var i=0; i<schedule.length; i++) {
          var item = schedule[i];

          var team1 = (item.isHome ? item.home : item.away);
          var team2 = (item.isHome ? item.away : item.home);

          var logo1 = '<div class="logo logo-bg-dark--team-' + team1.id + '"></div>';
          var vsOrAt = '<div class="vs-or-at">' + (item.isHome ? 'vs' : 'at') + '</div>';
          var logo2 = '<div class="logo logo-bg-dark--team-' + team2.id + '"></div>';


          var time = '<div class="time">' + new Date(Date.parse(item.gameDate)).toLocaleTimeString() + '</div>';
          
          var channels = '<div class="channels">' + item.broadcasts.join(', ') + '</div>';

          html += '<div class="item">' + logo1 + vsOrAt + logo2 + time + channels + '</div>';

        }
        html += '</div>';
      }

      $('#body-wrapper').html(html);

    });
  };

  var loadCss = function() {
    var url = 'https://nhl.andrewmacheret.com/css';
    $.getJSON(url, function(json) {
      var link = document.createElement('link')
      link.setAttribute('rel', 'stylesheet')
      link.setAttribute('type', 'text/css')
      link.setAttribute('href', json.logosUrl)
      document.getElementsByTagName('head')[0].appendChild(link)
    });
  };

  var query = getQueryObject();

  if (!query.team) {
    query.team = 'sharks'; // go sharks!
  }
  if (!query.date) {
    query.date = newLocalDate();
  }
  window.history.replaceState({}, null, '?team=' + query.team + '&date=' + query.date);

  loadSchedule(query.team, query.date);

  loadCss();
});
