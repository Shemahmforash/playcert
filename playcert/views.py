from pyramid.view import view_config
import os
import eventful
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

    # log.debug('location %s', location)

    # get events from redis
    events = request.redis.get(events_redis_key)

    events = dill.loads(events) if events else ''
    if not events:
        # or get the events from the eventful api
        events = api.call(
            '/events/search', c='music', l=location, date='This week'
        )
        # log.debug('api response: %s', events)

        # log.debug('api response total_items: %s', events['total_items'])

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

    log.debug('events: %s', events)

    return {
        'events': events,
        'playlist': playlist,
        'location': location,
        'today': today
    }


def simplify_events(events):

    event_list = events['events']['event']

    # eventful api does not respond with list when the result is just one item
    # so we force it to be a list
    if not isinstance(event_list, list):
        event_list = [event_list]

    # instantiate Event class with the necessary data
    events = [
        event.Event(ev['title'], ev['start_time'], ev['venue_name'])
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
