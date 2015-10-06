from pyramid.view import view_config
from lib import event
import os
import eventful
import datetime
import logging
import re
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
    today = str(datetime.date.today())

    data = {'location': location, 'today': today, 'request': request}

    events = get_events(**data)

    # could not find events in api, empty response
    if not events:
        # TODO: support this correctly in the template
        return {
            'events': [],
            'playlist': [],
            'location': location,
            'today': today
        }

    # try to obtain the playlist from redis
    playlist_redis_key = location + '.playlist.' + today
    playlist = request.redis.get(playlist_redis_key)
    playlist = dill.loads(playlist) if playlist else ''

    # if no playlist on redis, create it and set it on redis
    if not playlist:
        playlist = create_playlist(events)

        if playlist:
            request.redis.set(playlist_redis_key, dill.dumps(playlist))

    log.debug('events: %s', events)

    return {
        'events': events,
        'playlist': playlist,
        'location': location,
        'today': today
    }


def cache_events(f):
    '''
    Caches events on redis
    '''
    def decorated_function(**kwargs):
        request = kwargs['request']

        events_redis_key = "%s.events.%s" % (
            kwargs['location'], kwargs['today'])

        # get events from redis
        events = request.redis.get(events_redis_key)
        events = dill.loads(events) if events else ''

        if events:
            return events

        # find the events
        events = f(**kwargs)

        # save them on cache
        if events:
            # and set them on redis
            request.redis.set(events_redis_key, dill.dumps(events))

            return events
    return decorated_function


@cache_events
def get_events(**kwargs):
    # get the events from the eventful api
    events = api.call(
        '/events/search', c='music', l=kwargs['location'], date='This week'
    )

    if (not events or int(events['total_items']) == 0):
        return []

    # simplify them
    return simplify_events(events, kwargs['request'])


def simplify_events(events, request):
    '''
    Simplify the eventful event list
    by instantiating a class for each event with specific data
    '''

    event_list = events['events']['event']

    # eventful api does not respond with list when the result is just one item
    # so we force it to be a list
    if not isinstance(event_list, list):
        event_list = [event_list]

    # create a list with Event objects with the necessary data
    events = [
        event.Event(
            ev['title'], ev['start_time'], ev['venue_name'], request.redis)
        for ev in event_list]

    return events


def create_playlist(events):
    """ Creates a playlist string to be rendered
    """

    log.info('create_playlist')

    # retrieve the ids from a random song of each event artist
    ids = [random.choice(
        event.artist.songs).spotify_id for event in events
        if event.artist and event.artist.songs]

    playlist = ','.join(ids)

    # log.info('ids - %s', ids)

    # remove reference to spotify:track
    pattern = re.compile('spotify\:track\:')
    playlist = pattern.sub('', playlist)

    log.info('playlist - %s', playlist)

    return playlist
