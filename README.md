# NHL Today

[![Deploy to S3](https://github.com/andrewmacheret/nhl-client/actions/workflows/deploy.yml/badge.svg)](https://github.com/andrewmacheret/nhl-client/actions/workflows/deploy.yml) [![License](https://img.shields.io/badge/license-MIT-lightgray.svg)](https://github.com/andrewmacheret/nhl-client/blob/master/LICENSE.md)

Shows what NHL games are on today for your favorite team, with the TV channels they're on, the score once the game starts, the team's record, and the next game. Live scores refresh every minute. It uses the same glassy look as the [cube](https://andrewmacheret.com/projects/cube/) and [Monty Hall](https://andrewmacheret.com/projects/montyhall/) pages, follows the system's light or dark mode, and works on phones and desktops.

The footer has a team picker and links to subscribe to the team's schedule in Apple Calendar or Google Calendar.

Live at [andrewmacheret.com/projects/nhl](https://andrewmacheret.com/projects/nhl/).

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="www/screenshot-dark.png">
  <img alt="Screenshot of NHL Today showing a Sharks vs Kraken game" src="www/screenshot.png">
</picture>

## Usage

Pick a team and date with query parameters:

- `team`: the team's name, city or abbreviation, like `sharks`, `maple leafs`, `toronto` or `tor`. Defaults to `sharks`.
- `date`: `YYYY-MM-DD`. Defaults to today.

For example, [`?team=maple%20leafs&date=2026-11-21`](https://andrewmacheret.com/projects/nhl/?team=maple%20leafs&date=2026-11-21). The arrow buttons, or the left and right arrow keys, move a day back or forward.

## How it works

It's a static page in `www/` with no libraries. Game data and logo URLs come from [andrewmacheret/nhl-server-lambda](https://github.com/andrewmacheret/nhl-server-lambda) at `https://nhl.andrewmacheret.com`.

That API only allows requests from `https://andrewmacheret.com` (CORS), so opening `www/index.html` locally shows a blank page. To try changes locally, point `apiUrl` in `www/index.js` at a local copy of the server, or proxy the API.

## Deploy

Pushes to `master` copy `www/` to `s3://andrewmacheret.com/projects/nhl` and clear the CloudFront cache through GitHub Actions (see `.github/workflows/deploy.yml`). The workflow signs in to AWS with GitHub OIDC using the IAM role in the `AWS_ROLE_ARN` repo variable.

`www/screenshot.png` is used for this README and for link previews (`og:image`). `www/screenshot-dark.png` is the README screenshot for GitHub's dark theme.
