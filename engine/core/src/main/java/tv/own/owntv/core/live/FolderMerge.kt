package tv.own.owntv.core.live

/**
 * Same-named provider folders from different playlists shown as one: two playlists that both carry
 * "News" give one "News" folder holding the channels of both.
 *
 * [folders] are (category id, display name) in rail order. The result maps the first id of each name
 * (the one the rail keeps) to every id with that name, in rail order; names compare trimmed and
 * case-insensitively. A name that appears once maps to just its own id.
 */
fun mergeFoldersByName(folders: List<Pair<Long, String>>): LinkedHashMap<Long, List<Long>> {
    val byName = LinkedHashMap<String, MutableList<Long>>()
    folders.forEach { (id, name) -> byName.getOrPut(name.trim().lowercase()) { mutableListOf() } += id }
    return byName.values.associateTo(LinkedHashMap()) { ids -> ids.first() to ids.toList() }
}
