package tv.own.owntv.core.metadata

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class ProgrammeTitleTest {
    @Test
    fun `film and series marks give the kind and leave the bare title`() {
        assertEquals(ProgrammeTitle("Брат 2", MetadataType.MOVIE), ProgrammeTitle.parse("Х/ф «Брат 2» (16+)"))
        assertEquals(ProgrammeTitle("Великолепная пятёрка", MetadataType.TV), ProgrammeTitle.parse("Т/с \"Великолепная пятёрка\". 12-я серия"))
    }

    @Test
    fun `brackets episodes and age marks are dropped`() {
        assertEquals(ProgrammeTitle("Наш спецназ", null), ProgrammeTitle.parse("Наш спецназ (Животная жестокость)"))
        assertEquals(ProgrammeTitle("Чингачгук - Большой Змей", null), ProgrammeTitle.parse("Чингачгук - Большой Змей [12+]"))
        assertEquals(ProgrammeTitle("След Сокола", null), ProgrammeTitle.parse("След Сокола, 3 серия"))
    }

    @Test
    fun `news sport and talk shows are never looked up`() {
        assertNull(ProgrammeTitle.parse("Новости"))
        assertNull(ProgrammeTitle.parse("Вести. Местное время"))
        assertNull(ProgrammeTitle.parse("60 минут"))
        assertNull(ProgrammeTitle.parse("Футбол. Лига чемпионов"))
        assertNull(ProgrammeTitle.parse("Д/ф «Тайны века»"))
    }
}
