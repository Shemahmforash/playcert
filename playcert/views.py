from pyramid.view import view_config
import os
import eventful
import redis
import datetime
import logging
import re
import event
import random
import dill

log = logging.getLogger(__name__)

api = eventful.API(os.environ['EVENTFUL_KEY'])
redisClient = redis.StrictRedis(host='localhost', port=6379, db=0)


@view_config(route_name='home', renderer='templates/mytemplate.pt')
def my_view(request):
    return {'project': 'playcert'}


@view_config(route_name='newevents', renderer='templates/events.pt')
def new_events_view(request):
    location = request.matchdict['location']
    today = datetime.date.today()
    events_redis_key = location + '.events.' + str(today)

    log.debug('location %s', location)

    # get events from redis
    events = redisClient.get(events_redis_key)

    events = dill.loads(events) if events else ''
    if not events:
        # or get the events from the eventful api
        events = api.call(
            '/events/search', c='music', l=location, date='This week'
        )
        # log.debug('api response: %s', events)

        events = simplify_events(events)
        log.debug('processed_events: %s', events)

        # and set them on redis
        redisClient.set(events_redis_key, dill.dumps(events))

    # now create the playlist
    playlist = create_playlist(events)

    return {
        'events': events,
        'playlist': playlist
    }


def simplify_events(events):

    evs = []

    for ev in events['events']['event']:
        log.debug('event %s', ev)
        eventObj = event.Event(ev['title'], ev['start_time'], ev['venue_name'])

        evs.append(eventObj)

    return evs


def create_playlist(events):
    """ Creates a playlist string to be rendered
    """

    log.info('create_playlist')

    ids = []
    for event in events:
        # log.info('event %s', event.title)

        if not event.artist:
            continue

        artist = event.artist

        # log.info('artist %s', artist.name)

        if artist.songs:
            track = random.choice(artist.songs)

            # log.info('track %s - %s', track.name, track.spotifyId)

            ids.append(track.spotifyId)

    ids = ','.join(ids)

    # log.info('ids - %s', ids)

    # remove reference to spotify:track
    pattern = re.compile('spotify\:track\:')
    ids = pattern.sub('', ids)

    log.info('ids - %s', ids)

    return ids


def generate_playlist(songs):
    """ Creates a playlist string to be rendered
    """
    # just use the foreign id from songs
    ids = []
    for s in songs:
        ids.append(s['foreign_id'])

    ids = ','.join(ids)

    # remove reference to spotify:track
    pattern = re.compile('spotify\:track\:')
    ids = pattern.sub('', ids)

    return ids
