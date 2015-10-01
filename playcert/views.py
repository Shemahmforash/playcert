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


@view_config(route_name='home', renderer='templates/mytemplate.pt')
def my_view(request):
    return {'project': 'playcert'}


@view_config(route_name='newevents', renderer='templates/newevents.pt')
def new_events_view(request):
    location = request.matchdict['location']
    today = datetime.date.today()
    events_redis_key = location + '.events.' + str(today)

    log.debug('location %s', location)

    # get events from redis
    events = request.redis.get(events_redis_key)

    events = dill.loads(events) if events else ''
    if not events:
        # or get the events from the eventful api
        events = api.call(
            '/events/search', c='music', l=location, date='This week'
        )
        log.debug('api response: %s', events)

        log.debug('api response total_items: %s', events['total_items'])

        # could not find events in api, empty response
        if not events or int(events['total_items']) == 0:
            # TODO: support this correctly in the template
            return {
                'events': [],
                'playlist': [],
                'location': location,
                'today': today
            }

        events = simplify_events(events)
        log.debug('processed_events: %s', events)

        # and set them on redis
        request.redis.set(events_redis_key, dill.dumps(events))

    # try to obtain the playlist from redis
    playlist_redis_key = location + '.playlist.' + str(today)
    playlist = request.redis.get(playlist_redis_key)
    playlist = dill.loads(playlist) if playlist else ''

    # if no playlist on redis, create it and set it on redis
    if not playlist:
        playlist = create_playlist(events)

        request.redis.set(playlist_redis_key, dill.dumps(playlist))

    return {
        'events': events,
        'playlist': playlist,
        'location': location,
        'today': today
    }


def simplify_events(events):

    evs = []

    event_list = events['events']['event']

    # eventful api does not respond with list when the result is just one item
    # so we force it to be a list
    if not isinstance(event_list, list):
        event_list = [event_list]

    for ev in event_list:
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
